# OHAI 消費者前端 openhair-app — Next 16 + Workflow SDK 容器
# 用 pnpm build + next start(非 next output:standalone):openhair-app 的
# next.config 被 withWorkflow 包住,standalone tracing 對 Workflow 產生的
# .well-known/workflow 路由未經驗證;沿用與 M1(pnpm dev/next start)同源
# 的執行方式最穩、且不改 next.config(規格 §6 不重建既有層)。
FROM node:22-slim AS app
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# 依賴層(lockfile 不變則快取)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 原始碼
COPY . .

# NEXT_PUBLIC_* 在 build 時被 Next inline,必須在 build 階段就存在
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
