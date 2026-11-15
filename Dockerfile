# Build index.html from src/ (build.js uses only Node built-ins, so no npm install).
FROM node:22-alpine AS build
WORKDIR /app
COPY build.js package.json ./
COPY src ./src
COPY assets ./assets
# There is no git in here, so whoever builds the image says which build this is. Left empty, the game shows
# the version from package.json alone.
ARG LAST_RETURN_BUILD_NUMBER=
ARG LAST_RETURN_BUILD_COMMIT=
RUN node build.js

# Serve the single self-contained page.
FROM nginx:1.27-alpine
COPY --from=build /app/index.html /usr/share/nginx/html/index.html
# Writes LAST_RETURN_SERVER_NAME into the page when the container starts, if it is set.
COPY --chmod=755 docker/40-server-name.sh /docker-entrypoint.d/40-last-return-server-name.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
