FROM node:23-slim AS base

RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  python3-venv \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

FROM base AS installer

WORKDIR /app

COPY . .

RUN npm install
RUN npm run build

FROM base AS production

WORKDIR /app

RUN python3 -m venv /opt/venv
RUN /opt/venv/bin/pip install --upgrade pip
RUN /opt/venv/bin/pip install uv mcpo

ENV PATH="/opt/venv/bin:$PATH"

COPY --from=installer /app/build ./build
COPY --from=installer /app/node_modules ./node_modules

EXPOSE 8000

CMD ["uvx", "mcpo", "--port", "8000", "--", "node", "/app/build/index.js"]
