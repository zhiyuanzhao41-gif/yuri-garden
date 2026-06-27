# 莉莉安百合风俗店
AI聊天程序，调用大模型API实现角色扮演对话

## 主要功能

1. 选择角色：主界面可以选择不同的角色卡，点击进入详情页查看角色详情，然后可以开始对话
2. AI对话：利用提示词，让AI扮演百合女角色，与玩家互动

## 角色提示词

角色资源放在 `data/characters/{角色id}/`。每个角色目录包含 `character.json`、`prompt.md`，以及可选的 `avatar.jpg` 和 `cover.jpg`。修改 `prompt.md` 即可调整人设、世界观、说话风格和回复规则；后端会在每次请求时读取对应角色的提示词，并自动作为 `system` 消息发送给模型。

## 对话存档

对话文件放在 `data/conversation/{角色id}/`。例如 `data/conversation/sakiko/` 保存祥子的会话，`data/conversation/ajisai/` 保存紫阳花的会话。

## 本地与 ngrok 访问

后端会同时托管前端页面和 `/api/*` 接口。启动后端：

```powershell
cd backend
npm start
```

本地访问 `http://localhost:3000`。如果要通过 ngrok 暴露到外网，另开一个终端运行：

```powershell
ngrok http 3000
```

把 ngrok 输出的 `https://*.ngrok-free.app` 地址发给别人即可。

## 次要功能

1. 注册登录：新用户需要注册登录，然后填写自己的API密钥才能开始游戏
2. 长期化记忆系统：将用户的对话数据用json格式存储，达到上下文长度限制时压缩对话
