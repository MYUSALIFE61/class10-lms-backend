import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MCQModule } from '../components/learning/MCQModule.jsx';
import { NotesPanel, PYQPanel, FormulaSheet } from '../components/learning/ResourcePanels.jsx';
import { lmsApi } from '../services/lmsApi.js';

describe('Phase 3: Learning Modules & Gated Resource Panels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads MCQs, submits student answers, and displays server-graded score & explanation', async () => {
    vi.spyOn(lmsApi, 'getLessonMcqs').mockResolvedValue({
      mcqs: [
        {
          id: 'mcq-1',
          questionText: 'What is the value of sin(30°)?',
          options: ['1/2', '1', '0', 'sqrt(3)/2'],
        },
      ],
    });
    vi.spyOn(lmsApi, 'submitLessonMcqs').mockResolvedValue({
      score: 1,
      totalQuestions: 1,
      percentage: 100,
      results: [
        {
          mcqId: 'mcq-1',
          selectedOptionIndex: 0,
          correctOptionIndex: 0,
          isCorrect: true,
          explanation: 'sin(30°) = 1/2 in standard trigonometric ratios.',
        },
      ],
    });

    render(
      <MemoryRouter>
        <MCQModule lessonId="lesson-1" />
      </MemoryRouter>
    );

    expect(await screen.findByText(/What is the value of sin/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/1\/2/));
    fireEvent.click(screen.getByRole('button', { name: /Submit Answers/i }));

    await waitFor(() => {
      expect(screen.getByText(/Score: 1\/1 \(100%\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/standard trigonometric ratios/)).toBeInTheDocument();
  });

  it('renders locked vs unlocked states for Notes, PYQs, and Formulas', () => {
    const onUpgrade = vi.fn();
    render(
      <div>
        <NotesPanel
          notes={[
            { id: 'n1', title: 'Locked Note', locked: true, contentMarkdown: null },
            { id: 'n2', title: 'Free Note', locked: false, contentMarkdown: 'Key SSC points' },
          ]}
          onUpgrade={onUpgrade}
        />
        <PYQPanel
          pyqs={[
            {
              id: 'p1',
              board: 'AP',
              examYear: 2024,
              marks: 4,
              questionText: 'State Pythagoras Theorem.',
              locked: false,
              modelAnswer: 'In a right triangle, c^2 = a^2 + b^2.',
            },
          ]}
          onUpgrade={onUpgrade}
        />
        <FormulaSheet
          formulas={[
            {
              id: 'f1',
              title: 'Quadratic Formula',
              locked: false,
              formulaExpression: 'x = (-b ± sqrt(b^2 - 4ac)) / 2a',
              explanation: 'Solves ax^2 + bx + c = 0',
            },
          ]}
          onUpgrade={onUpgrade}
        />
      </div>
    );

    expect(screen.getByText('Key SSC points')).toBeInTheDocument();
    expect(screen.getByText(/AP SSC 2024/)).toBeInTheDocument();
    expect(screen.getByText(/Quadratic Formula/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Unlock with ₹499 Pass/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
