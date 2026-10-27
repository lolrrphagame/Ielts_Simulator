import { privateApi } from "@/lib/server/private-api";

async function handle(
  request: Request,
  context: RouteContext<"/api/private/[...path]">,
) {
  return privateApi(request, (await context.params).path);
}
export { handle as GET, handle as HEAD, handle as POST, handle as PUT };
