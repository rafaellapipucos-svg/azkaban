// Deno loads rrule 2.8.1 from its CommonJS `main` (a UMD bundle), whose named exports Deno cannot
// detect, so `import { RRule } from 'rrule'` in packages/core fails to boot. The import map points
// `rrule` here instead, which re-exports the same package with the names core uses.
import rrule from 'npm:rrule@2.8.1';

export const { RRule } = rrule;
