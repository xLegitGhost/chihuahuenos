FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN pnpm build && mkdir -p /app/uploads/identities

EXPOSE 4000

CMD ["node", "dist/main.js"]
