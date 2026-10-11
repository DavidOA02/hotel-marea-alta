import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Login } from './login';
export const metadata: Metadata = { title: 'Ingresar al panel', robots: { index: false } };
export default function Pagina() { return <Suspense><Login /></Suspense>; }
