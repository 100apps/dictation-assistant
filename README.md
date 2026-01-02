# 智能听写小助手 (Dictation Assistant)

一个专为小学生设计的智能听写辅助工具，结合了语音合成（TTS）、语音识别（ASR）和艾宾浩斯遗忘曲线复习策略，旨在帮助孩子高效地进行词语听写和记忆巩固。

## 🎯 项目目标

1.  **解放家长**：解决家长没时间报听写、发音不标准或容易念错的问题。
2.  **自主学习**：让孩子能够独立完成听写作业，培养自主学习习惯。
3.  **科学复习**：利用科学的记忆曲线算法，智能安排复习计划，告别死记硬背。
4.  **即时反馈**：利用语音识别辅助录入，听写完成后快速进行自我订正。

## 🧠 核心策略

*   **输入多样化**：支持批量文本输入和语音录入（Web Speech API），方便快速建立词库。
*   **个性化听写**：支持调整播放语速、间隔时间、播放顺序（顺序/倒序/乱序）以及重复次数，适应不同阶段的学习需求。
*   **艾宾浩斯记忆曲线 (Ebbinghaus Forgetting Curve)**：
    *   应用内置了类似 SuperMemo (SM-2) 的简化算法。
    *   根据用户的听写结果（正确/错误），动态计算下一次复习的时间点。
    *   错误词语会立即进入短期复习队列，掌握的词语会逐渐延长复习间隔。
*   **浏览器端离线优先**：所有数据存储在本地浏览器（LocalStorage），保护隐私，无网络也能使用核心功能。

## 🏗 技术架构

本项目采用现代前端技术栈构建，追求轻量化和高性能：

*   **核心框架**: [React 19](https://react.dev/) - 构建用户界面的核心库。
*   **构建工具**: [Vite](https://vitejs.dev/) - 极速的前端构建工具。
*   **语言**: [TypeScript](https://www.typescriptlang.org/) - 提供静态类型检查，增强代码健壮性。
*   **样式库**: [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架，快速构建美观的响应式界面。
*   **AI/Web 能力**:
    *   **SpeechSynthesis (TTS)**: 用于朗读词语，支持选择系统内置的不同发音人。
    *   **SpeechRecognition (ASR)**: 用于语音录入词语（需浏览器支持，如 Chrome）。
*   **持久化**: `LocalStorage` - 用于保存词库、用户设置和复习进度。

## 🚀 本地开发与调试

### 前置要求
*   [Node.js](https://nodejs.org/) (推荐 v18 或更高版本)

### 步骤

1.  **克隆项目**
    ```bash
    git clone https://github.com/100apps/dictation-assistant.git
    cd dictation-assistant
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **启动开发服务器**
    ```bash
    npm run dev
    ```
    打开浏览器访问终端显示的地址（通常是 `http://localhost:5173`）。

4.  **构建生产版本**
    ```bash
    npm run build
    ```

## 📦 部署

本项目配置了 GitHub Actions，推送到 `main` 分支后会自动构建并发布到 GitHub Pages。

*   **部署地址**: [dictation-assistant.gf.sh.cn](https://dictation-assistant.gf.sh.cn)

## 📄 License

MIT License