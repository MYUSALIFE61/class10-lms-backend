import { ValidationError } from '../utils/errors.js';

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (body) {
        const res = body.safeParse(req.body);
        if (!res.success) {
          throw new ValidationError('Invalid request body', formatZodIssues(res.error.issues));
        }
        req.body = res.data;
      }
      if (query) {
        const res = query.safeParse(req.query);
        if (!res.success) {
          throw new ValidationError('Invalid query parameters', formatZodIssues(res.error.issues));
        }
        req.query = res.data;
      }
      if (params) {
        const res = params.safeParse(req.params);
        if (!res.success) {
          throw new ValidationError('Invalid path parameters', formatZodIssues(res.error.issues));
        }
        req.params = res.data;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
