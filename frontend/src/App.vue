<template>
  <div class="chat">

    <!-- 1. 消息列表 -->
    <div class="messages">
      <!-- 用 v-for 循环 messages，格式：v-for="(msg, i) in messages" :key="i" -->
      <!-- 给每条消息加:class="msg.role"，这样用户和AI的样式可以分开 -->
      <!-- 在div 里显示 msg.content，用 {{ }} 语法 -->

      <div v-for="(msg, i) in messages" :key="i" :class="msg.role">
        {{ msg.content }}
      </div>
    </div>

    <!-- 2. 输入栏 -->
    <div class="input-bar">
      <!-- 一个 input，用 v-model 绑定 input 变量 -->
      <input type="text" v-model="input">

      <!-- 一个 button，用 @click 绑定 send 函数（我们下一步写），:disabled 绑定 loading -->
      <button @click="send()" :disabled="loading">发送</button>
      </div>
  </div>
</template>


<script setup lang="ts">
import { ref } from 'vue'

// 试着自己定义上面说的 3 个变量：
// 1. messages — 消息列表，初始值是空数组 []
// 2. input — 输入框内容，初始值是空字符串 ''
// 3. loading — 加载状态，初始值是 false

const messages = ref([]);
const input = ref('');
const loading = ref(false);


async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return  // 空内容或加载中，直接退出

  // 1. 把用户消息加进列表
  messages.value.push({ role: 'user', content: text })

  // 2. 清空输入框
  input.value = ''

  // 3. 占位：先加一条空的AI消息（等会流式填入内容）
  messages.value.push({ role: 'assistant', content: '' })

  loading.value = true

  // 拿到刚才那条空的 AI 消息的引用
const assistantMsg = messages.value[messages.value.length - 1]

const res = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: messages.value.slice(0, -1) })
})

// 用 reader 一块一块地读流
const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const chunk = decoder.decode(value)
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6))
      if (data.content) assistantMsg.content += data.content// 追加文字
    }
  }
}

loading.value = false

}

</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.user {
  align-self: flex-end;
  background-color: #4caf50;          /* 绿色背景 */
  color: #ffffff;
  border-radius: 18px 18px 4px 18px;
  padding: 10px 16px;
  width: fit-content;
  max-width: 50vw;                    /* 最多占屏幕宽度50% */
  word-break: break-word;
}

.assistant {
  align-self: flex-start;
  background-color: #ffffff;          /* 白色背景 */
  color: #1a1a1a;
  border-radius: 18px 18px 18px 4px;
  padding: 10px 16px;
  width: fit-content;
  max-width: 50vw;                    /* 最多占屏幕宽度50% */
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* ===== 底部输入栏 ===== */
.input-bar {
  display: flex;
  width: 100%;
  gap: 8px;
  padding: 12px 16px;
  background-color: #ffffff;
  border-top: 1px solid #ddd;
  box-sizing: border-box;
}

.input-bar input {
  flex: 1;                     /* 占据剩余宽度 */
  padding: 10px 14px;
  border: 1px solid #ccc;
  border-radius: 20px;         /* 圆角输入框 */
  font-size: 16px;
  outline: none;               /* 去掉默认聚焦轮廓 */
  transition: border-color 0.2s;
}

.input-bar input:focus {
  border-color: #007aff;       /* 聚焦时高亮边框 */
}

.input-bar button {
  padding: 10px 20px;
  background-color: #007aff;   /* 蓝色背景 */
  color: #ffffff;
  border: none;               /* 无边框 */
  border-radius: 20px;        /* 圆角 */
  cursor: pointer;            /* 手型指针 */
  font-size: 16px;
  font-weight: 500;
  transition: background-color 0.2s, opacity 0.2s;
  white-space: nowrap;        /* 防止按钮文字换行 */
}

.input-bar button:hover {
  background-color: #005bbf;   /* 悬停加深 */
}

.input-bar button:active {
  opacity: 0.7;               /* 点击反馈 */
}


</style>
