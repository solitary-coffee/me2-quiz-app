import { publicMaintenanceGate } from './_shared/maintenance.js';
import { blockResponseForRequest } from './_shared/ip-block.js';

export async function onRequest(context) {
  const blockedResponse = await blockResponseForRequest(context.request, context.env);
  if (blockedResponse) return blockedResponse;
  const maintenance = await publicMaintenanceGate(context.request, context.env, 'me2');
  if (maintenance) return maintenance;
  return context.next();
}
