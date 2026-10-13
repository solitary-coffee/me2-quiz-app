import { blockResponseForRequest } from './_shared/ip-block.js';

export async function onRequest(context) {
  const blockedResponse = await blockResponseForRequest(context.request, context.env);
  if (blockedResponse) return blockedResponse;
  return context.next();
}
