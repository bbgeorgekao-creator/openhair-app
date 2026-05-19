"use client";

/**
 * /preview/chat — 視覺預覽路由（無需登入）
 *
 * 用途：
 *   - 子里程碑 B 的視覺驗收：對著 EVA-消費者版概念圖 05 比對 ChatView 視覺
 *   - 階段 2、3 改 UI 時也可繼續用此頁對照
 *   - 不在 (dashboard) 群組下、不被 proxy.ts 的 /chat 守衛攔到（needsAuth 只 match /chat、/api/managed-agents、/api/github）
 *
 * 紀律對齊：
 *   - 完全不碰 auth、proxy、lib/、app/api/ —— 對齊「邏輯不動」紀律
 *   - 真實 Eva 對話驗證在子里程碑 D（接 Supabase Auth 後）才做
 */

import { useState } from "react";
import { ChatView, type TranscriptEvent } from "@/components/chat/chat-view";

const NOW = Date.now();

const MOCK_EVENTS: TranscriptEvent[] = [
  {
    id: "mock-u1",
    type: "user.message",
    payload: {
      content: [
        { type: "text", text: "你好 Eva，我最近頭髮毛躁很嚴重 😢" },
      ],
    },
    occurredAt: new Date(NOW).toISOString(),
  },
  {
    id: "mock-a1",
    type: "agent.message",
    payload: {
      content: [
        {
          type: "text",
          text:
            "嗨～聽起來你最近髮況不太穩呢 🌿\n\n" +
            "毛躁通常跟兩件事有關：**頭皮油水平衡**、**髮絲水分流失**。可以告訴我多一點嗎？\n\n" +
            "- 最近有沒有染燙過？\n" +
            "- 平常用什麼洗髮精？\n" +
            "- 是吹乾後就毛躁，還是隔天起床特別嚴重？",
        },
      ],
    },
    occurredAt: new Date(NOW + 2_000).toISOString(),
  },
  {
    id: "mock-u2",
    type: "user.message",
    payload: {
      content: [
        {
          type: "text",
          text: "三個月前染過，洗髮精用市售的，吹乾後就有毛躁",
        },
      ],
    },
    occurredAt: new Date(NOW + 30_000).toISOString(),
  },
  {
    id: "mock-a2",
    type: "agent.message",
    payload: {
      content: [
        {
          type: "text",
          text:
            "了解了～染過三個月剛好是「色素穩定但髮絲開始空洞」的時間點。\n\n" +
            "市售洗髮精很多含界面活性劑（像 SLS），對染後髮會偏乾。我先給妳兩個方向：\n\n" +
            "1. **換成胺基酸系或弱酸性洗髮精**（pH 5.5 左右最貼近頭皮）\n" +
            "2. **吹乾前先用免沖護髮油**，主要塗在髮中到髮尾\n\n" +
            "妳想先試染（看色板）、還是想我幫妳介紹一個熟悉染後護髮的設計師？",
        },
      ],
    },
    occurredAt: new Date(NOW + 32_000).toISOString(),
  },
];

export default function PreviewChatPage() {
  const [text, setText] = useState("");

  // 手機框 wrapper · 對齊 EVA-消費者版概念圖 05 的 .phone-screen 比例
  // - 寬 390px（concept 380 + 呼吸）
  // - 高 = min(880px, viewport 留邊)，concept min-height 820
  // - 外層淺灰底 #f5f5f3，框圓角 + 陰影模擬手機外殼
  // - ChatView 放在 relative 容器內，輸入區的 absolute bottom 會貼到框底而非整頁底
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4"
      style={{ background: "#f5f5f3" }}
    >
      <div
        className="relative flex flex-col overflow-hidden bg-background"
        style={{
          width: "min(390px, 100vw)",
          height: "min(880px, calc(100vh - 32px))",
          borderRadius: 32,
          boxShadow:
            "0 30px 60px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        <ChatView
          events={MOCK_EVENTS}
          text={text}
          onTextChange={setText}
          onSend={() => alert("Preview only — 真實 Eva 對話在子里程碑 D 開通")}
          onQuickReply={(reply) =>
            alert(`Preview only — 點到 quick reply: ${reply}`)
          }
          sending={false}
          isActive={true}
          showThinking={true}
          loading={false}
          error={null}
          showSidebarToggle={false}
          onSidebarToggle={() => {}}
        />
      </div>
    </div>
  );
}
