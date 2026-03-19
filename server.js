const express = require('express');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// AI Chat proxy - forwards requests to LLM providers (streaming)
app.post('/api/chat', async (req, res) => {
  const { apiUrl, apiKey, model, messages } = req.body;

  if (!apiUrl || !apiKey || !model || !messages) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  try {
    new URL(apiUrl);
  } catch {
    return res.status(400).json({ error: '无效的 API 地址' });
  }

  try {
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, stream: true })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      try {
        return res.status(upstream.status).json(JSON.parse(errText));
      } catch {
        return res.status(upstream.status).json({ error: errText });
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('data', chunk => res.write(chunk));
    nodeStream.on('end', () => res.end());
    nodeStream.on('error', () => res.end());
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: '连接失败: ' + e.message });
    }
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DevToolBox running on port ${PORT}`);
});
