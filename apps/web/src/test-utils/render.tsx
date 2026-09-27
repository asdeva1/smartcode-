import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@smartcode/ui';

/** Renders with a fresh, retry-free QueryClient and the app's ToastProvider. */
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

type Handler = (path: string, options?: RequestInit) => unknown;

/**
 * Routes mocked apiFetch calls by "METHOD path-prefix". The longest
 * matching prefix wins; unmatched calls reject so a missing mock fails
 * loudly instead of silently rendering nothing.
 */
export function routeApi(mock: jest.Mock, routes: Record<string, unknown | Handler>) {
  mock.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, p] = k.split(' ');
        return m === method && path.startsWith(p);
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return Promise.reject(new Error(`Unhandled ${method} ${path}`));
    const value = routes[key];
    try {
      return Promise.resolve(typeof value === 'function' ? (value as Handler)(path, options) : value);
    } catch (e) {
      return Promise.reject(e);
    }
  });
}

export const page = <T,>(rows: T[], total = rows.length, p = 1) => ({ data: rows, total, page: p, pageSize: 25 });

/** Picks an option from an MUI select rendered by @smartcode/ui Select. */
export async function chooseOption(user: ReturnType<typeof userEvent.setup>, label: string | RegExp, option: string | RegExp) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
}

/** Calls to a mocked apiFetch matching a path prefix and method. */
export function callsTo(mock: jest.Mock, prefix: string, method = 'GET') {
  return mock.mock.calls.filter(([p, o]) => String(p).startsWith(prefix) && (o?.method ?? 'GET') === method);
}

/**
 * Business rule regression guard: the prohibited medical-coding field
 * must never be rendered by any workspace. Kept in one place so the term
 * appears once in the web test code.
 */
export function expectNoProhibitedField(container: HTMLElement = document.body) {
  expect(container.textContent ?? '').not.toMatch(/\bjcds?\b/i);
}
