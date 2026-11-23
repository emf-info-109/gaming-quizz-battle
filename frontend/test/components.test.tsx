import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerGrid } from '../src/components/AnswerGrid';
import { InstanceBadge } from '../src/components/InstanceBadge';
import { TimerBar } from '../src/components/TimerBar';

describe('composants', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('InstanceBadge affiche l’instance renvoyée par l’API (pas une valeur du build)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ instance: 'WEB-02' }), { status: 200, headers: { 'X-Instance-Name': 'WEB-02' } }),
      ),
    );
    render(
      <MemoryRouter>
        <InstanceBadge />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('instance-name').textContent).toContain('WEB-02'));
  });

  it('AnswerGrid ne marque aucune bonne réponse tant qu’elle n’est pas révélée', () => {
    const { rerender } = render(<AnswerGrid answers={['a', 'b', 'c', 'd']} selected={1} />);
    expect(screen.queryByLabelText('Bonne réponse')).toBeNull();
    rerender(<AnswerGrid answers={['a', 'b', 'c', 'd']} selected={1} correctIndex={2} />);
    expect(screen.getByLabelText('Bonne réponse')).toBeTruthy();
    expect(screen.getByLabelText('Mauvaise réponse')).toBeTruthy();
  });

  it('TimerBar affiche les secondes restantes arrondies au supérieur', () => {
    render(<TimerBar remainingMs={4200} totalMs={15000} />);
    expect(screen.getByText('5')).toBeTruthy();
  });
});
