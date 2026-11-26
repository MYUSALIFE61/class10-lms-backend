import os
import uuid
import shutil
import threading
from pathlib import Path

from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp


app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads_files"

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def cleanup_old_files():
    """
    Delete downloaded files older than 30 minutes.
    """
    import time

    now = time.time()

    for item in DOWNLOAD_DIR.iterdir():
        try:
            if item.is_file():
                age = now - item.stat().st_mtime

                if age > 1800:
                    item.unlink()

            elif item.is_dir():
                age = now - item.stat().st_mtime

                if age > 1800:
                    shutil.rmtree(item, ignore_errors=True)

        except Exception:
            pass


def safe_title(title):
    """
    Keep filenames reasonably safe.
    """
    if not title:
        return "video"

    invalid = '<>:"/\\|?*'

    for char in invalid:
        title = title.replace(char, "")

    return title[:150].strip() or "video"


def start_cleanup_thread():
    def worker():
        import time

        while True:
            cleanup_old_files()
            time.sleep(600)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()


# --------------------------------------------------
# Home
# --------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# --------------------------------------------------
# Analyze URL
# --------------------------------------------------

@app.route("/api/info", methods=["POST"])
def video_info():

    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not url:
        return jsonify({
            "success": False,
            "error": "Please enter a video URL."
        }), 400

    try:

        options = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
        }

        with yt_dlp.YoutubeDL(options) as ydl:

            info = ydl.extract_info(url, download=False)

            if not info:
                raise Exception("Unable to retrieve video information.")

            formats = []

            for fmt in info.get("formats", []):

                video_codec = fmt.get("vcodec")
                audio_codec = fmt.get("acodec")

                if video_codec == "none":
                    continue

                height = fmt.get("height")

                if not height:
                    continue

                filesize = fmt.get("filesize") or fmt.get("filesize_approx")

                formats.append({
                    "format_id": fmt.get("format_id"),
                    "ext": fmt.get("ext") or "mp4",
                    "height": height,
                    "fps": fmt.get("fps"),
                    "filesize": filesize,
                    "has_audio": audio_codec != "none"
                })

            # Remove duplicate qualities
            unique = {}

            for item in formats:

                key = (
                    item["height"],
                    item["ext"],
                    item["has_audio"]
                )

                unique[key] = item

            formats = list(unique.values())

            formats.sort(
                key=lambda x: (
                    x["height"],
                    x["has_audio"]
                ),
                reverse=True
            )

            return jsonify({
                "success": True,
                "title": info.get("title", "Video"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
                "webpage_url": info.get("webpage_url"),
                "formats": formats[:20]
            })

    except yt_dlp.utils.DownloadError as e:

        return jsonify({
            "success": False,
            "error": "This URL could not be processed. The website may be unsupported, unavailable, private, or require access."
        }), 400

    except Exception as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# --------------------------------------------------
# Download
# --------------------------------------------------

@app.route("/api/download", methods=["POST"])
def download_video():

    data = request.get_json(silent=True) or {}

    url = str(data.get("url", "")).strip()
    quality = str(data.get("quality", "best")).strip()
    media_type = str(data.get("type", "video")).strip()

    if not url:
        return jsonify({
            "success": False,
            "error": "Please enter a video URL."
        }), 400

    job_id = uuid.uuid4().hex

    job_dir = DOWNLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:

        output_template = str(
            job_dir / "%(title).150s.%(ext)s"
        )

        # ------------------------------------------
        # AUDIO / MP3
        # ------------------------------------------

        if media_type == "audio":

            options = {
                "format": "bestaudio/best",
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,

                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ]
            }

        # ------------------------------------------
        # VIDEO
        # ------------------------------------------

        else:

            if quality == "best":

                format_selector = (
                    "bestvideo+bestaudio/"
                    "best"
                )

            else:

                try:
                    height = int(quality)

                    format_selector = (
                        f"bestvideo[height<={height}]"
                        f"+bestaudio/"
                        f"best[height<={height}]"
                    )

                except ValueError:

                    format_selector = (
                        "bestvideo+bestaudio/best"
                    )

            options = {
                "format": format_selector,
                "outtmpl": output_template,
                "merge_output_format": "mp4",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True
            }

        # ------------------------------------------
        # DOWNLOAD
        # ------------------------------------------

        with yt_dlp.YoutubeDL(options) as ydl:

            info = ydl.extract_info(
                url,
                download=True
            )

            title = safe_title(
                info.get("title", "video")
            )

        # Find resulting file
        files = list(job_dir.iterdir())

        if not files:

            raise Exception(
                "Download completed but no file was created."
            )

        # Prefer final media file
        media_files = [
            f for f in files
            if f.is_file()
            and f.suffix.lower() in [
                ".mp4",
                ".mkv",
                ".webm",
                ".mp3",
                ".m4a"
            ]
        ]

        if media_files:
            final_file = media_files[0]
        else:
            final_file = files[0]

        return send_file(
            final_file,
            as_attachment=True,
            download_name=final_file.name
        )

    except yt_dlp.utils.DownloadError:

        shutil.rmtree(
            job_dir,
            ignore_errors=True
        )

        return jsonify({
            "success": False,
            "error": "Download failed. The video may be unavailable, private, restricted, or unsupported."
        }), 400

    except Exception as e:

        shutil.rmtree(
            job_dir,
            ignore_errors=True
        )

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# --------------------------------------------------
# Error handlers
# --------------------------------------------------

@app.errorhandler(413)
def too_large(error):
    return jsonify({
        "success": False,
        "error": "The requested file is too large."
    }), 413


@app.errorhandler(404)
def not_found(error):

    if request.path.startswith("/api/"):
        return jsonify({
            "success": False,
            "error": "API endpoint not found."
        }), 404

    return render_template("index.html"), 404


@app.errorhandler(500)
def server_error(error):

    return jsonify({
        "success": False,
        "error": "Internal server error."
    }), 500


# --------------------------------------------------
# Start server
# --------------------------------------------------

if __name__ == "__main__":

    start_cleanup_thread()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )