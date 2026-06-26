// 安装依赖: npm install express cors dotenv
import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // 用于读取 .env 文件中的 API_KEY

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body; // 前端传过来的对话历史

    // 1. 设置响应头，告诉前端我要开始推送流式数据了
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 2. 调用大模型 API（以 OpenAI 兼容格式为例）
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`, // 密钥放环境变量！绝对不写死
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        stream: true, // 开启流式，这是关键
      }),
    });

    // 3. 核心：一边接收大模型的字，一边转手推给前端
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // 解析 SSE 格式的数据，提取真正的文字内容
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const json = JSON.parse(line.replace('data: ', ''));
          const content = json.choices[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`); // 实时推给前端
          }
        }
      }
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  }
  res.end();
});

app.listen(3000, () => console.log('AI 代理服务已启动 ▶ http://localhost:3000'));