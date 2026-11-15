# Build index.html from src/ (build.js uses only Node built-ins, so no npm install).
FROM node:22-alpine AS build
WORKDIR /app
COPY build.js package.json ./
COPY src ./src
COPY assets ./assets
# There is no git in here, so whoever builds the image says which build this is. Left empty, the game shows
# the version from package.json alone.
ARG NO_RETURN_BUILD_NUMBER=
ARG NO_RETURN_BUILD_COMMIT=
RUN node build.js

# Serve the single self-contained page.
FROM nginx:1.27-alpine
COPY --from=build /app/index.html /usr/share/nginx/html/index.html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
