FROM node:20-alpine

WORKDIR /app

# Copy manifests first so the dependency layer is cached separately.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
