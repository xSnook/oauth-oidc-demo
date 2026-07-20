FROM node:24.18.0-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM base AS build
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_AZURE_CLIENT_ID
ARG APP_GIT_SHA=development
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
RUN npm run build
RUN printf '%s\n' "$APP_GIT_SHA" > /app/dist/deploy-sha

FROM nginxinc/nginx-unprivileged:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
