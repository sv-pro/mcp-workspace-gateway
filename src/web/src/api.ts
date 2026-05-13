export async function getGatewayStatus(): Promise<unknown> {
  const response = await fetch('/api/status');
  return response.json();
}
