import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { store, demoTenants } from '../store/store';
import { startSession } from '../services/auth';

/** Fresh empty store (production default: no users, no records). */
export function resetStore() { store.reset(); }

/** Store with the fictitious demo organizations, logged in as `userId`. */
export function withDemo(userId = 'u_marina') {
  store.reset();
  store.set(s => ({ ...s, tenants: [...s.tenants, ...demoTenants()] }));
  startSession('org_aurora', userId);
  return store.get().tenants.find(t => t.id === 'org_aurora')!.data;
}

export const tenantData = () => store.get().tenants.find(t => t.id === store.get().session?.tenantId)!.data;

export function renderAt(path: string, routes: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>{routes}</Routes></MemoryRouter>);
}
export { Route };
