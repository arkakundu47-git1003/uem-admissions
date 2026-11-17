import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../src/components/ui/Feedback';

describe('EmptyState heading', () => {
  it('is a level-3 heading by default', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing here' })).toBeInTheDocument();
  });
  it('can be the page heading (level 1), as on the "Page not found" screen', () => {
    render(<EmptyState title="Page not found" headingLevel="h1" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});
