# Use the official Node.js image with Alpine Linux
FROM node:16-alpine

ENV TELEGRAM_BOT_TOKEN=""
ENV TELEGRAM_USER_ID=""
ENV API_URL=""
ENV API_TOKEN=""
ENV ENABLE_AI=false
ENV ENABLE_JINA=false
ENV OPEAI_URL="https://api.openai.com/v1"
ENV OPEAI_KEY=""
ENV OPEAI_MODEL="gpt-3.5-turbo"
ENV JINA_TOKEN=""
ENV JINA_KEEP_IMAGES=false

# Set the working directory for the app
WORKDIR /app

# Copy the app code to the container
COPY . .

# Install the dependencies
RUN npm install

# Expose the port that the app listens on
# EXPOSE 8080

# Run the app when the container starts
CMD ["node", "bot.js"]
