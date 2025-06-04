FROM node:20.11.0

WORKDIR /app

# ✅ Install the real netcat package
RUN apt-get update && apt-get install -y netcat-openbsd

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod +x delay.sh
EXPOSE 5001

CMD ["sh", "./delay.sh"]
