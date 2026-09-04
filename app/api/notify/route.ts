import { env } from "cloudflare:workers";

type RequestNotice = {
  name: string;
  product: string;
  quantity: number;
  dueDate: string;
  priority: string;
  submitter: string;
  feishuLink: string;
};

export async function POST(request: Request) {
  try {
    const item = (await request.json()) as Partial<RequestNotice>;
    const webhook = (env as unknown as Record<string, string | undefined>).FEISHU_WEBHOOK_URL;
    if (!webhook) return Response.json({ error: "飞书机器人尚未配置" }, { status: 503 });
    if (!item.name || !item.product || !item.dueDate || !item.submitter) return Response.json({ error: "通知字段不完整" }, { status: 400 });
    const lines = [
      "🎬 新拍摄需求",
      `需求名称：${item.name}`,
      `产品：${item.product}`,
      `数量：${Math.max(1, Number(item.quantity) || 1)}`,
      `截止日期：${item.dueDate}`,
      `优先级：${item.priority || "普通"}`,
      `提交人：${item.submitter}`,
      item.feishuLink ? `飞书链接：${item.feishuLink}` : "",
    ].filter(Boolean).join("\n");
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: lines } }),
    });
    if (!response.ok) throw new Error(`飞书通知发送失败（${response.status}）`);
    const result = await response.json().catch(() => ({})) as { code?: number; StatusCode?: number; msg?: string };
    if ((typeof result.code === "number" && result.code !== 0) || (typeof result.StatusCode === "number" && result.StatusCode !== 0)) throw new Error(result.msg || "飞书机器人拒绝了通知");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "发送飞书通知失败" }, { status: 500 });
  }
}
