// Re-export from the split stats module for backward compatibility.
// The Stats component is lazy-loaded from this path in App.tsx:
//   const Stats = lazy(() => import('./components/Stats').then(m => ({ default: m.Stats })));
export { Stats } from './stats/index';
