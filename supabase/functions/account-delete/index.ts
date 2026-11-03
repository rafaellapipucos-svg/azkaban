// "Delete my account" (ADR-0012, section 3). The handler and its checks: _shared/account.ts.
import { handleDelete } from '../_shared/account.ts';
import { serviceClient } from '../_shared/http.ts';

Deno.serve((req) => handleDelete(req, serviceClient()));
