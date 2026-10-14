# Mapache para equipos: cuentas, invitaciones, roles y colaboración en directo. Ver TEAM.md.
#   docker compose up -d        (o: docker build -t mapache . && docker run -p 4321:4321 -v mapache-data:/data mapache)
# Sin dependencias: la imagen es Node.js más el código de Mapache.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ENV NODE_ENV=production \
    MAPACHE_MODE=team \
    MAPACHE_DATA=/data \
    HOST=0.0.0.0 \
    PORT=4321

WORKDIR /app
COPY package.json server.js ./
COPY bin ./bin
COPY lib ./lib
COPY src ./src

# Los tableros, las cuentas y los vídeos viven en /data (un volumen: sobreviven a las actualizaciones).
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4321) + '/api/info').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js", "--no-star"]
