import {
  BedrockRuntimeClient,
  ConverseStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import { config } from "dotenv";
import express from "express";
import prompts from "./prompts.js";

config();

const app = express();
const port = 3000;
const llm_id = "anthropic.claude-3-5-sonnet-20240620-v1:0";

// Define AWS configuration
const aws_region = "us-east-1";
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
};
const awsConfig = {
  region: aws_region,
  credentials: credentials,
};

// Parse JSON bodies
app.use(express.json());

app.get("/api", (req, res) => {
  res.send("Welcome to JiraGenie");
});

app.post("/api/llmstreaming", async (req, res) => {
  const { query, agent } = req.body;

  try {
    let systemPrompt = null;
    if (agent) {
       systemPrompt = prompts.jira_assistant;
      }

    const _response = await chatWithLLMStreaming(
      query,
      null,
      systemPrompt
    );
    streamingResponse(res, _response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Streaming error" });
  }
});

app.post("/api/jira", async (req, res) => {
  const { query } = req.body;

  try {
    const response = await fetch(`${process.env.JIRA_BASE_URL}${query}`,{
      headers: {
        Authorization: `Bearer ${process.env.JIRA_API_KEY}`,
      },
    }
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error making API call' });
  }
})

async function streamingResponse(res, _response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Function to send data to the client
  const sendData = (data) => {
    res.write(data);
  };

  try {
    for await (const item of _response.stream) {
      if (item.contentBlockDelta) {
        const text = item.contentBlockDelta.delta?.text;
        sendData(text);
      }
    }

    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Streaming error" });
  }
}

async function chatWithLLMStreaming(
  query,
  retrievdContext,
  systemPrompt
) {
  const client = new BedrockRuntimeClient(awsConfig);

  const input = {
    modelId: llm_id,
    messages: [
      {
        role: "user",
        content: [
          {
            text: query,
          },
        ],
      },
    ],
  };
  if (retrievdContext) {
    input.messages[0].content.push({ text: retrievdContext });
  }

  if (systemPrompt) {
    input["system"] = [
      {
        text: systemPrompt,
      },
    ];
  }

  const command = new ConverseStreamCommand(input);
  const response = await client.send(command);
  return response;
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});