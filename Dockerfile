# ================== مرحلة البناء ==================
FROM node:20-alpine AS build
WORKDIR /app

# نسخ ملفات الحزم أولاً للاستفادة من طبقة الكاش
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# متغيرات البناء (تُحقن في الحزمة عند npm run build)
# مررها عند البناء:  docker build --build-arg VITE_MAPBOX_TOKEN=pk.xxx ...
ARG VITE_API_BASE_URL=/api
ARG VITE_REALTIME_MODE=signalr
ARG VITE_REALTIME_HUB_URL=/hubs/tracking
ARG VITE_MAPBOX_TOKEN
ARG VITE_MAP_STYLE=mapbox://styles/mapbox/streets-v12
ARG VITE_NAVIGATION_STYLE=mapbox://styles/mapbox/navigation-day-v1
ARG VITE_GOOGLE_CLIENT_ID

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_REALTIME_MODE=$VITE_REALTIME_MODE \
    VITE_REALTIME_HUB_URL=$VITE_REALTIME_HUB_URL \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_MAP_STYLE=$VITE_MAP_STYLE \
    VITE_NAVIGATION_STYLE=$VITE_NAVIGATION_STYLE \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY . .
RUN npm run build

# ================== مرحلة التشغيل ==================
FROM nginx:1.27-alpine
# قالب Nginx مع envsubst التلقائي (BACKEND_URL متغير عند التشغيل)
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/tawseela.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://host.docker.internal:5050

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
