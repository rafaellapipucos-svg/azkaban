// "Export my data" (ADR-0012, section 2). The handler and its checks: _shared/account.ts.
import { handleExport } from '../_shared/account.ts';
import { serviceClient } from '../_shared/http.ts';

Deno.serve((req) => handleExport(req, serviceClient()));
