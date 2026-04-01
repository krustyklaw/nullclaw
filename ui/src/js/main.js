window.init = init;
window.goStep = goStep;
window.doSetup = doSetup;
window.startChat = startChat;
window.selectProvider = selectProvider;
window.onSidebarModelChange = onSidebarModelChange;
window.onSidebarModelOverride = onSidebarModelOverride;
window.showFeature = showFeature;
window.showScreen = showScreen;
window.updateSlider = updateSlider;
window.goToSetup = goToSetup;
window.useSuggestion = useSuggestion;
window.toggleUserMenu = toggleUserMenu;
window.handleKey = handleKey;
window.autoResize = autoResize;
window.sendMessage = sendMessage;
window.selectUseCase = selectUseCase;
window.saveGmailConfig = saveGmailConfig;
window.clearGmailConfig = clearGmailConfig;
window.newResearchDoc = newResearchDoc;
window.startResearch = startResearch;
window.showNewTaskForm = showNewTaskForm;
window.addSource = addSource;
window.saveTask = saveTask;
window.resetTaskForm = resetTaskForm;
window.toggleTask = toggleTask;
            // State
            let currentStep = 0;
            let isFirstTime = false;
            let selectedProvider = null;
            let providerNeedsKey = false;
            let providerKeyHint = '';
            let history = [];
            let isLoading = false;
            let researchDocs = JSON.parse(
                localStorage.getItem("nullclaw_research_docs") || "[]",
            );
            let currentDocId = null;
            let scheduledTasks = JSON.parse(
                localStorage.getItem("nullclaw_tasks") || "[]",
            );
            let taskTimers = {};
            let taskSources = [];

            // Slider updates
            function updateSlider(type) {
                if (type === "temp") {
                    const slider = document.getElementById("temp-slider");
                    const value = parseFloat(slider.value).toFixed(1);
                    document.getElementById("temp-value").textContent = value;
                    updateSliderBackground(slider);
                } else if (type === "tokens") {
                    const slider = document.getElementById("tokens-slider");
                    document.getElementById("tokens-value").textContent =
                        slider.value;
                    updateSliderBackground(slider);
                }
            }

            function updateSliderBackground(slider) {
                const min = parseFloat(slider.min);
                const max = parseFloat(slider.max);
                const val = parseFloat(slider.value);
                const pct = ((val - min) / (max - min)) * 100;
                slider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--bg3) ${pct}%, var(--bg3) 100%)`;
            }

            // Init sliders on load
            function initSliders() {
                const tempSlider = document.getElementById("temp-slider");
                const tokensSlider = document.getElementById("tokens-slider");
                if (tempSlider) updateSliderBackground(tempSlider);
                if (tokensSlider) updateSliderBackground(tokensSlider);
            }

            // Suggestion chip click
            function useSuggestion(text) {
                const input = document.getElementById("chat-input");
                input.value = text;
                input.focus();
                sendMessage();
            }

            // User menu toggle (placeholder)
            function toggleUserMenu() {
                // Could show a dropdown menu in the future
            }

            // Init
            async function init() {
                const stepTitle = document.getElementById("step-0-title");
                const stepDesc = document.getElementById("step-0-desc");
                if (stepTitle)
                    stepTitle.textContent =
                        "Welcome! Let's get to know each other";
                if (stepDesc)
                    stepDesc.textContent =
                        "Tell us your name and choose a name for your AI assistant.";
                try {
                    const r = await fetch("/api/status");
                    const data = await r.json();
                    if (data.configured) {
                        isFirstTime = false;
                        const model = data.model || data.provider || "";
                        document.getElementById(
                            "sidebar-model-label",
                        ).textContent = model;
                        if (data.user_name) {
                            document.getElementById("user-name-input").value =
                                data.user_name;
                            updateUserProfile(data.user_name);
                        }
                        if (data.agent_name) {
                            document.getElementById("agent-name-input").value =
                                data.agent_name;
                            updateAgentNameUI(data.agent_name);
                        }
                        if (data.provider) {
                            preselectProvider(data.provider, data.model);
                            populateSidebarModels(data.provider, data.model);
                            const subtitle = document.getElementById("chat-subtitle");
                            if (subtitle) subtitle.textContent = "Powered by " + data.provider;
                        }
                        showScreen("app-shell");
                    } else {
                        isFirstTime = true;
                        showScreen("setup");
                    }
                } catch (e) {
                    isFirstTime = true;
                    showScreen("setup");
                }
                loadGmailStatus();
                renderDocList();
                renderTaskList();
                initSchedulerListeners();
                initSliders();
            }

            function updateUserProfile(name) {
                const displayName = name && name.trim() ? name.trim() : "User";
                const avatar = document.getElementById("user-avatar");
                const nameEl = document.getElementById("user-display-name");
                if (avatar)
                    avatar.textContent = displayName.charAt(0).toUpperCase();
                if (nameEl) nameEl.textContent = displayName;
            }

            // Screen management
            function showScreen(name) {
                document
                    .querySelectorAll(".screen")
                    .forEach((s) => s.classList.remove("active"));
                document.getElementById(name).classList.add("active");
            }

            function showFeature(name) {
                document
                    .querySelectorAll(".feature-screen")
                    .forEach((s) => s.classList.remove("active"));
                document.getElementById("fs-" + name).classList.add("active");
            }

            // Setup

            const PROVIDER_HINTS = {
                'anthropic': 'console.anthropic.com',
                'openai': 'platform.openai.com',
                'openrouter': 'openrouter.ai',
                'gemini': 'aistudio.google.com',
            };
            const NO_KEY_PROVIDERS = ['ollama', 'gemini-cli', 'claude-cli'];
            const PROVIDER_MODELS = {
                'anthropic':  ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
                'openai':     ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
                'openrouter': ['anthropic/claude-sonnet-4.6', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
                'gemini':     ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
                'ollama':     ['llama4', 'llama3.3', 'qwen2.5-coder', 'mistral', 'codellama', 'deepseek-r1'],
                'gemini-cli': ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
                'claude-cli': ['claude-opus-4-6', 'claude-sonnet-4-6'],
            };

            function preselectProvider(key, currentModel) {
                const needsKey = !NO_KEY_PROVIDERS.includes(key);
                const hint = PROVIDER_HINTS[key] || null;
                selectProvider(key, needsKey, hint, currentModel);
            }

            function populateSelect(selectEl, models, currentModel) {
                selectEl.innerHTML = models.map(m =>
                    `<option value="${m}"${m === currentModel ? ' selected' : ''}>${m}</option>`
                ).join('');
            }

            function selectProvider(key, needsKey, hint, currentModel) {
                selectedProvider = key;
                providerNeedsKey = needsKey;
                providerKeyHint = hint || '';
                document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
                const card = document.getElementById('pc-' + key);
                if (card) card.classList.add('selected');

                // Populate wizard model dropdown
                const models = PROVIDER_MODELS[key] || [];
                const wizardModelField = document.getElementById('wizard-model-field');
                const wizardModelSelect = document.getElementById('wizard-model-select');
                if (wizardModelSelect && models.length > 0) {
                    populateSelect(wizardModelSelect, models, currentModel || models[0]);
                    wizardModelField.style.display = 'block';
                } else if (wizardModelField) {
                    wizardModelField.style.display = 'none';
                }

                // Show/hide API key field
                const apiField = document.getElementById('apikey-field');
                const apiHint = document.getElementById('apikey-hint');
                if (needsKey) {
                    apiField.style.display = 'block';
                    if (apiHint) {
                        apiHint.textContent = hint
                            ? 'Get your key at ' + hint + (isFirstTime ? '' : ' — leave blank to keep existing key')
                            : (isFirstTime ? '' : 'Leave blank to keep existing key');
                    }
                } else {
                    apiField.style.display = 'none';
                    const apiInput = document.getElementById('api-key-input');
                    if (apiInput) apiInput.value = '';
                }
                const setupBtn = document.getElementById('setup-btn');
                if (setupBtn) setupBtn.disabled = false;
            }

            function populateSidebarModels(provider, currentModel) {
                const sel = document.getElementById('model-select');
                const overrideInput = document.getElementById('sidebar-model-override');
                if (!sel) return;
                const models = PROVIDER_MODELS[provider] || [];
                if (models.length > 0) {
                    const knownModel = models.includes(currentModel) ? currentModel : models[0];
                    populateSelect(sel, models, knownModel);
                    // If current model isn't in the known list, show it in the override field
                    if (overrideInput && currentModel && !models.includes(currentModel)) {
                        overrideInput.value = currentModel;
                    }
                } else if (currentModel) {
                    sel.innerHTML = `<option value="${currentModel}" selected>${currentModel}</option>`;
                }
            }

            async function onSidebarModelChange(newModel) {
                const overrideInput = document.getElementById('sidebar-model-override');
                if (overrideInput && overrideInput.value.trim()) return; // override takes precedence
                if (!selectedProvider || !newModel) return;
                await fetch('/api/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: selectedProvider, model: newModel }),
                }).catch(() => {});
            }

            async function onSidebarModelOverride(customModel) {
                if (!selectedProvider) return;
                const model = customModel.trim() || document.getElementById('model-select')?.value;
                if (!model) return;
                await fetch('/api/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: selectedProvider, model }),
                }).catch(() => {});
            }

            function goStep(n) {
                document.getElementById("wizard-error").style.display = "none";
                document.getElementById("wizard-error-1").style.display = "none";
                if (currentStep === 0 && n === 1) {
                    const userName = document.getElementById("user-name-input").value.trim();
                    const agentName = document.getElementById("agent-name-input").value.trim();
                    if (!userName) {
                        const err = document.getElementById("wizard-error");
                        err.textContent = "Please enter your name.";
                        err.style.display = "block";
                        return;
                    }
                    if (!agentName) {
                        const err = document.getElementById("wizard-error");
                        err.textContent = "Please enter a name for your agent.";
                        err.style.display = "block";
                        return;
                    }
                }
                document.querySelectorAll(".wizard-step").forEach((s) => s.classList.remove("active"));
                document.querySelectorAll(".dot").forEach((d, i) => {
                    d.classList.remove("active", "done");
                    if (i < n) d.classList.add("done");
                    else if (i === n) d.classList.add("active");
                });
                document.getElementById(`step-${n}`).classList.add("active");
                currentStep = n;
                // Refresh provider step when entering step 1 (isFirstTime may have changed)
                if (n === 1 && selectedProvider) {
                    const curModel = document.getElementById('wizard-model-select')?.value;
                    selectProvider(selectedProvider, providerNeedsKey, providerKeyHint || null, curModel);
                }
            }

            async function doSetup() {
                const btn = document.getElementById("setup-btn");
                const errEl = document.getElementById("wizard-error-1");
                const apiKey = document.getElementById("api-key-input").value.trim();
                const userName = document.getElementById("user-name-input").value.trim();
                const agentName = document.getElementById("agent-name-input").value.trim();

                if (!selectedProvider) {
                    errEl.textContent = "Please select a provider.";
                    errEl.style.display = "block";
                    return;
                }
                if (providerNeedsKey && !apiKey && isFirstTime) {
                    errEl.textContent = "Please enter your API key.";
                    errEl.style.display = "block";
                    return;
                }
                btn.disabled = true;
                btn.textContent = "Setting up...";
                errEl.style.display = "none";
                try {
                    const wizardModelOverride = document.getElementById('wizard-model-override')?.value.trim();
                    const wizardModel = wizardModelOverride || document.getElementById('wizard-model-select')?.value;
                    const body = { provider: selectedProvider };
                    if (apiKey) body.api_key = apiKey;
                    if (wizardModel) body.model = wizardModel;
                    if (userName) body.user_name = userName;
                    if (agentName) body.agent_name = agentName;
                    const r = await fetch("/api/setup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    });
                    const data = await r.json();
                    if (data.error) {
                        errEl.textContent = data.error;
                        errEl.style.display = "block";
                    } else {
                        isFirstTime = false;
                        if (agentName) updateAgentNameUI(agentName);
                        if (userName) updateUserProfile(userName);
                        populateSidebarModels(selectedProvider, wizardModel || null);
                        const subtitle = document.getElementById("chat-subtitle");
                        if (subtitle) subtitle.textContent = "Powered by " + selectedProvider;
                        goStep(2);
                    }
                } catch (e) {
                    errEl.textContent = "Setup failed: " + e.message;
                    errEl.style.display = "block";
                } finally {
                    btn.disabled = false;
                    btn.textContent = "Set Up";
                }
            }

            function updateAgentNameUI(name) {
                const displayName = name && name.trim() ? name.trim() : "KrustyKlaw";
                document.title = displayName + " — KrustyKlaw";
                const sidebarName = document.getElementById("sidebar-agent-name");
                if (sidebarName) sidebarName.textContent = displayName;
            }

            function startChat() {
                history = [];
                showScreen("app-shell");
                showFeature("chat");
                document.getElementById("chat-input").focus();
            }

            function goToSetup() {
                isFirstTime = false;
                const apiInput = document.getElementById("api-key-input");
                if (apiInput) apiInput.value = "";
                const err = document.getElementById("wizard-error-1");
                if (err) err.style.display = "none";
                document.getElementById("step-0-title").textContent = "Update your settings";
                document.getElementById("step-0-desc").textContent =
                    "Update your name, agent name, or switch providers.";
                showScreen("setup");
                goStep(0);
            }

            // Chat
            function newConversation() {
                history = [];
                const msgs = document.getElementById("messages");
                const sidebarName =
                    document.getElementById("sidebar-agent-name");
                const displayName =
                    sidebarName && sidebarName.textContent
                        ? sidebarName.textContent.trim()
                        : "KrustyKlaw";
                msgs.innerHTML = `<div id="welcome-area">
                    <div class="message-group">
                        <div class="message-sender">KRUSTYKLAW</div>
                        <div class="message-bubble">
                            Hello, I am your AI assistant. Please ask me anything. I can help with code, writing, research, and more.
                        </div>
                    </div>
                    <div class="suggestion-chips" id="suggestion-chips">
                        <div class="suggestion-chip" onclick="useSuggestion('Connect with my Gmail')">
                            <span class="chip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>
                            Connect with my Gmail
                        </div>
                        <div class="suggestion-chip" onclick="useSuggestion('Slack Channel Bot')">
                            <span class="chip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>
                            Slack Channel Bot
                        </div>
                        <div class="suggestion-chip" onclick="useSuggestion('Telegram Assistant')">
                            <span class="chip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
                            Telegram Assistant
                        </div>
                    </div>
                </div>`;
                document.getElementById("chat-input").focus();
            }

            function handleKey(e) {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            }

            function autoResize(el) {
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 200) + "px";
            }

            async function sendMessage() {
                if (isLoading) return;
                const input = document.getElementById("chat-input");
                const msg = input.value.trim();
                if (!msg) return;
                const errEl = document.getElementById("chat-error");
                errEl.style.display = "none";
                const welcome = document.getElementById("welcome-area");
                if (welcome) welcome.remove();
                appendMessage("user", msg);
                history.push({ role: "user", content: msg });
                input.value = "";
                input.style.height = "auto";

                const typingId = "typing-" + Date.now();
                const msgs = document.getElementById("messages");
                const typingDiv = document.createElement("div");
                typingDiv.className = "message-group";
                typingDiv.id = typingId;
                typingDiv.innerHTML = `<div class="message-sender">KRUSTYKLAW</div>
                    <div class="typing"><span></span><span></span><span></span></div>`;
                msgs.appendChild(typingDiv);
                scrollToBottom();
                isLoading = true;
                document.getElementById("send-btn").disabled = true;

                try {
                    const r = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: msg,
                            history: history.slice(0, -1),
                        }),
                    });
                    const data = await r.json();
                    document.getElementById(typingId)?.remove();
                    if (data.error) {
                        const detail = data.detail ? ` — ${data.detail}` : '';
                        errEl.textContent = "Warning: " + data.error + detail;
                        errEl.style.display = "block";
                        history.pop();
                    } else {
                        const response = data.response || "";
                        appendMessage("ai", response);
                        history.push({ role: "assistant", content: response });

                        if (data.thread_events && data.thread_events.length > 0) {
                            const tool_execs = data.thread_events.filter(e => e.type === 'tool_execution');
                            if (tool_execs.length > 0) {
                                const tool_list = tool_execs.map(e => e.tool).join(', ');
                                const toolHtml = `<div style="font-size:11px;color:var(--text2);margin-top:4px;">Uses tools: ${tool_list}</div>`;
                                const msgs = document.getElementById("messages");
                                const lastBubble = msgs.lastElementChild.querySelector('.message-bubble');
                                if (lastBubble) {
                                    lastBubble.insertAdjacentHTML('beforeend', toolHtml);
                                }
                            }
                        }
                    }
                } catch (e) {
                    document.getElementById(typingId)?.remove();
                    errEl.textContent =
                        "Connection error. Is KrustyKlaw still running?";
                    errEl.style.display = "block";
                    history.pop();
                } finally {
                    isLoading = false;
                    document.getElementById("send-btn").disabled = false;
                    input.focus();
                    scrollToBottom();
                }
            }

            function appendMessage(role, content) {
                const msgs = document.getElementById("messages");
                const div = document.createElement("div");
                div.className = "message-group";
                const sidebarName =
                    document.getElementById("sidebar-agent-name");
                const agentName = sidebarName
                    ? sidebarName.textContent.trim().toUpperCase()
                    : "KRUSTYKLAW";
                if (role === "user") {
                    const userName =
                        document.getElementById("user-display-name");
                    const name = userName
                        ? userName.textContent.trim().toUpperCase()
                        : "YOU";
                    div.innerHTML = `<div class="message-sender" style="text-align:right;">${name}</div><div class="message-bubble user-bubble" style="align-self:flex-end;">${renderMarkdown(content)}</div>`;
                } else {
                    div.innerHTML = `<div class="message-sender">${agentName}</div><div class="message-bubble">${renderMarkdown(content)}</div>`;
                }
                msgs.appendChild(div);
                scrollToBottom();
            }

            function scrollToBottom() {
                const msgs = document.getElementById("messages");
                msgs.scrollTop = msgs.scrollHeight;
            }

            // Markdown Renderer
            function renderMarkdown(text) {
                let s = text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                s = s.replace(
                    /```(\w*)\n?([\s\S]*?)```/g,
                    (_, lang, code) =>
                        `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`,
                );
                s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
                const blocks = s.split(/\n{2,}/);
                const out = blocks.map((block) => {
                    if (block.startsWith("<pre>")) return block;
                    block = block.replace(/^### (.+)$/gm, "<h3>$1</h3>");
                    block = block.replace(/^## (.+)$/gm, "<h2>$1</h2>");
                    block = block.replace(/^# (.+)$/gm, "<h1>$1</h1>");
                    if (/^[-*] /m.test(block)) {
                        const items = block
                            .split("\n")
                            .map((l) =>
                                l.match(/^[-*] (.+)/)
                                    ? `<li>${l.replace(/^[-*] /, "")}</li>`
                                    : l,
                            )
                            .join("");
                        return `<ul>${items}</ul>`;
                    }
                    if (/^\d+\. /m.test(block)) {
                        const items = block
                            .split("\n")
                            .map((l) =>
                                l.match(/^\d+\. (.+)/)
                                    ? `<li>${l.replace(/^\d+\. /, "")}</li>`
                                    : l,
                            )
                            .join("");
                        return `<ol>${items}</ol>`;
                    }
                    if (block.startsWith("&gt;"))
                        return `<blockquote>${block.replace(/^&gt; ?/gm, "")}</blockquote>`;
                    block = block.replace(
                        /\*\*([^*]+)\*\*/g,
                        "<strong>$1</strong>",
                    );
                    block = block.replace(/\*([^*]+)\*/g, "<em>$1</em>");
                    block = block.replace(
                        /__([^_]+)__/g,
                        "<strong>$1</strong>",
                    );
                    block = block.replace(/_([^_]+)_/g, "<em>$1</em>");
                    block = block.replace(/\n/g, "<br>");
                    if (
                        !block.startsWith("<h") &&
                        !block.startsWith("<ul") &&
                        !block.startsWith("<ol") &&
                        !block.startsWith("<blockquote")
                    )
                        return `<p>${block}</p>`;
                    return block;
                });
                return out.join("\n");
            }

            // Use Cases
            function selectUseCase(id, card) {
                document
                    .querySelectorAll(".uc-card")
                    .forEach((c) => c.classList.remove("active-uc"));
                document
                    .querySelectorAll(".uc-detail")
                    .forEach((d) => d.classList.remove("active"));
                card.classList.add("active-uc");
                document.getElementById("uc-" + id).classList.add("active");
            }

            // Gmail config stored in localStorage
            const GMAIL_KEY = "nullclaw_gmail_config";

            function loadGmailStatus() {
                const cfg = JSON.parse(
                    localStorage.getItem(GMAIL_KEY) || "null",
                );
                const pill = document.getElementById("gmail-status-pill");
                if (!pill) return;
                if (cfg && cfg.address) {
                    pill.className = "status-pill connected";
                    pill.textContent = "\u2B24  " + cfg.address;
                    document.getElementById("gmail-addr").value = cfg.address;
                } else {
                    pill.className = "status-pill disconnected";
                    pill.textContent = "\u2B24  Not connected";
                }
            }

            function saveGmailConfig() {
                const addr = document.getElementById("gmail-addr").value.trim();
                const pass = document
                    .getElementById("gmail-apppass")
                    .value.trim();
                if (!addr || !addr.includes("@")) {
                    alert("Please enter a valid Gmail address.");
                    return;
                }
                if (!pass || pass.replace(/\s/g, "").length !== 16) {
                    alert(
                        "App Password should be 16 characters. Check Google Account \u2192 Security \u2192 App passwords.",
                    );
                    return;
                }
                localStorage.setItem(
                    GMAIL_KEY,
                    JSON.stringify({
                        address: addr,
                        savedAt: new Date().toISOString(),
                    }),
                );
                const pill = document.getElementById("gmail-status-pill");
                pill.className = "status-pill connected";
                pill.textContent = "\u2B24  " + addr;
                document.getElementById("gmail-apppass").value = "";
                fetch("/api/integrations/gmail", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ address: addr }),
                }).catch(() => {});
            }

            function clearGmailConfig() {
                localStorage.removeItem(GMAIL_KEY);
                document.getElementById("gmail-addr").value = "";
                document.getElementById("gmail-apppass").value = "";
                const pill = document.getElementById("gmail-status-pill");
                pill.className = "status-pill disconnected";
                pill.textContent = "\u2B24  Not connected";
            }

            // Deep Research
            function renderDocList() {
                const list = document.getElementById("doc-list");
                if (!list) return;
                if (researchDocs.length === 0) {
                    list.innerHTML =
                        '<div style="font-size:12px;color:var(--text2);padding:8px 4px;">No documents yet.</div>';
                    return;
                }
                list.innerHTML = researchDocs
                    .map(
                        (d, i) => `
                <div class="doc-item${currentDocId === d.id ? " active" : ""}" onclick="openDoc('${d.id}')">
                  <div class="doc-title">${escHtml(d.title)}</div>
                  <div class="doc-date">${new Date(d.createdAt).toLocaleDateString()}</div>
                </div>`,
                    )
                    .join("");
            }

            function openDoc(id) {
                const doc = researchDocs.find((d) => d.id === id);
                if (!doc) return;
                currentDocId = id;
                renderDocList();
                document.getElementById("doc-viewer").innerHTML =
                    `<div class="md-doc">
                <h1>${escHtml(doc.title)}</h1>
                <div class="doc-meta">Generated ${new Date(doc.createdAt).toLocaleString()} \u00B7 AI-compiled research document</div>
                ${renderMdDoc(doc.content)}
              </div>`;
            }

            function newResearchDoc() {
                currentDocId = null;
                renderDocList();
                document.getElementById("doc-viewer").innerHTML =
                    `<div class="empty-state"><div class="icon">KrustyKlaw</div><div>Enter a topic above and click <strong>Research</strong> to generate a document.</div></div>`;
                document.getElementById("research-input").focus();
            }

            function buildResearchPrompt(topic) {
                return `You are a research assistant with access to web search and other tools. Research the following topic thoroughly and produce a well-structured Markdown document.

            Topic: ${topic}

            Instructions:
            1. Use your web_search tool to find current, authoritative sources. Run multiple targeted queries.
            2. Start the document with a "## Research Process" section that lists the exact queries you ran and the key sources you found (title + URL). This is important \u2014 the user wants to see your actual research steps, not a summary.
            3. Then write the main document with these sections: Executive Summary, Background & Context, Key Findings, Current State of the Art, Challenges & Open Questions, Practical Applications, References.
            4. Cite sources inline using Markdown links: [Source Name](url).
            5. Output ONLY the Markdown document. No preamble, no "here is your document" framing.`;
            }

            async function startResearch() {
                const input = document.getElementById("research-input");
                const topic = input.value.trim();
                if (!topic) return;
                const btn = document.getElementById("research-btn");
                const prog = document.getElementById("research-progress");
                const statusText = document.getElementById(
                    "research-status-text",
                );
                btn.disabled = true;
                prog.classList.add("active");

                const startTime = Date.now();
                statusText.textContent = "Agent working\u2026";
                const stepInterval = setInterval(() => {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    statusText.textContent = `Agent working\u2026 ${elapsed}s`;
                }, 1000);

                try {
                    const r = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: buildResearchPrompt(topic),
                            history: [],
                        }),
                    });
                    clearInterval(stepInterval);
                    const data = await r.json();
                    if (data.error) throw new Error(data.error);
                    let content = data.response || "";

                    if (data.thread_events && data.thread_events.length > 0) {
                        const tool_execs = data.thread_events.filter(e => e.type === "tool_execution");
                        if (tool_execs.length > 0) {
                            const query_list = tool_execs.map(e => `- ${e.tool}`).join('\n');
                            content = content + '\n\n## Tool Executions\n\n' + query_list;
                        }
                    }
                    const doc = {
                        id: "doc_" + Date.now(),
                        title: topic,
                        content,
                        createdAt: new Date().toISOString(),
                    };
                    researchDocs.unshift(doc);
                    localStorage.setItem(
                        "nullclaw_research_docs",
                        JSON.stringify(researchDocs),
                    );
                    currentDocId = doc.id;
                    renderDocList();
                    openDoc(doc.id);
                    input.value = "";
                } catch (e) {
                    clearInterval(stepInterval);
                    const content = [
                        `# ${topic}`,
                        "",
                        "> \u26a0\ufe0f **Offline placeholder** \u2014 KrustyKlaw could not be reached.",
                        "> Start the KrustyKlaw server and try again to get AI-generated research.",
                        "",
                        "## What would be covered",
                        "",
                        `- Overview and background of **${topic}**`,
                        "- Current state of the art",
                        "- Key challenges and open questions",
                        "- Practical applications",
                        "- References and further reading",
                        "",
                        `_Error: ${e.message}_`,
                    ].join("\n");
                    const doc = {
                        id: "doc_" + Date.now(),
                        title: `[Offline] ${topic}`,
                        content,
                        createdAt: new Date().toISOString(),
                    };
                    researchDocs.unshift(doc);
                    localStorage.setItem(
                        "nullclaw_research_docs",
                        JSON.stringify(researchDocs),
                    );
                    currentDocId = doc.id;
                    renderDocList();
                    openDoc(doc.id);
                    input.value = "";
                } finally {
                    btn.disabled = false;
                    prog.classList.remove("active");
                }
            }

            function renderMdDoc(md) {
                let s = md
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                s = s.replace(
                    /```(\w*)\n?([\s\S]*?)```/g,
                    (_, lang, code) =>
                        `<pre><code>${code.trimEnd()}</code></pre>`,
                );
                s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
                s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
                s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
                s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
                s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
                s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
                s = s.replace(/^&gt; ?(.+)$/gm, "<blockquote>$1</blockquote>");
                s = s.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
                s = s.replace(/(<li>.*<\/li>)/gs, (m) => `<ul>${m}</ul>`);
                s = s.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
                s = s.replace(/\n\n/g, "</p><p>");
                return "<p>" + s + "</p>";
            }

            function escHtml(s) {
                return s
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;");
            }

            // Scheduler
            function initSchedulerListeners() {
                const intervalSel = document.getElementById("sched-interval");
                const actionSel = document.getElementById("sched-action");
                if (intervalSel)
                    intervalSel.addEventListener("change", () => {
                        document.getElementById("cron-wrap").style.display =
                            intervalSel.value === "custom" ? "block" : "none";
                    });
                if (actionSel)
                    actionSel.addEventListener("change", () => {
                        document.getElementById(
                            "custom-prompt-wrap",
                        ).style.display =
                            actionSel.value === "custom" ? "block" : "none";
                    });
            }

            function renderTaskList() {
                const list = document.getElementById("task-list");
                if (!list) return;
                if (scheduledTasks.length === 0) {
                    list.innerHTML =
                        '<div style="font-size:12px;color:var(--text2);padding:8px 4px;">No tasks configured. Add one.</div>';
                    return;
                }
                list.innerHTML = scheduledTasks
                    .map(
                        (t) => `
                <div class="task-row">
                  <span class="task-icon">${actionEmoji(t.action)}</span>
                  <div class="task-info">
                    <div class="task-name">${escHtml(t.name)}</div>
                    <div class="task-meta">${intervalLabel(t.interval)} \u00B7 ${t.action}</div>
                  </div>
                  <div class="task-toggle">
                    <label class="toggle-switch">
                      <input type="checkbox" ${t.enabled ? "checked" : ""} onchange="toggleTask('${t.id}',this.checked)">
                      <span class="toggle-track"></span>
                    </label>
                  </div>
                </div>`,
                    )
                    .join("");
            }

            function actionEmoji(action) {
                return (
                    {
                        summarize: "\u{1F4DD}",
                        diff: "\u{1F504}",
                        report: "\u{1F4C4}",
                        alert: "\u{1F6A8}",
                        custom: "\u{1F6E0}\uFE0F",
                    }[action] || "\u{1F6E0}\uFE0F"
                );
            }

            function intervalLabel(v) {
                if (v === "custom") return "Custom cron";
                const m = parseInt(v);
                if (m < 60) return `Every ${m}m`;
                if (m === 60) return "Hourly";
                if (m < 1440) return `Every ${m / 60}h`;
                return "Daily";
            }

            function addSource() {
                const inp = document.getElementById("source-input");
                const path = inp.value.trim();
                if (!path) return;
                taskSources.push(path);
                inp.value = "";
                renderSourcesList();
            }

            function renderSourcesList() {
                const list = document.getElementById("sources-list");
                list.innerHTML = taskSources
                    .map(
                        (s, i) => `
                <div class="source-chip">
                  <span class="sc-icon">\u{1F4C4}</span>
                  <span class="sc-path">${escHtml(s)}</span>
                  <span class="sc-remove" onclick="removeSource(${i})">\u2715</span>
                </div>`,
                    )
                    .join("");
            }

            function removeSource(i) {
                taskSources.splice(i, 1);
                renderSourcesList();
            }

            function showNewTaskForm() {
                resetTaskForm();
                showFeature("scheduler");
            }

            function resetTaskForm() {
                document.getElementById("sched-name").value = "";
                document.getElementById("sched-interval").value = "30";
                document.getElementById("sched-action").value = "summarize";
                document.getElementById("sched-cron").value = "";
                document.getElementById("sched-prompt").value = "";
                document.getElementById("cron-wrap").style.display = "none";
                document.getElementById("custom-prompt-wrap").style.display =
                    "none";
                taskSources = [];
                renderSourcesList();
            }

            function saveTask() {
                const name = document.getElementById("sched-name").value.trim();
                if (!name) {
                    alert("Please give the task a name.");
                    return;
                }
                const intervalSel = document.getElementById("sched-interval");
                const interval = intervalSel.value;
                const action = document.getElementById("sched-action").value;
                const task = {
                    id: "task_" + Date.now(),
                    name,
                    interval,
                    action,
                    cron:
                        interval === "custom"
                            ? document.getElementById("sched-cron").value.trim()
                            : null,
                    prompt:
                        action === "custom"
                            ? document
                                  .getElementById("sched-prompt")
                                  .value.trim()
                            : null,
                    sources: [...taskSources],
                    enabled: true,
                    createdAt: new Date().toISOString(),
                };
                scheduledTasks.push(task);
                localStorage.setItem(
                    "nullclaw_tasks",
                    JSON.stringify(scheduledTasks),
                );
                renderTaskList();
                scheduleTask(task);
                addLogEntry(
                    "ok",
                    `Task "${name}" created \u2014 ${intervalLabel(interval)}`,
                );
                resetTaskForm();
            }

            function toggleTask(id, enabled) {
                const t = scheduledTasks.find((t) => t.id === id);
                if (!t) return;
                t.enabled = enabled;
                localStorage.setItem(
                    "nullclaw_tasks",
                    JSON.stringify(scheduledTasks),
                );
                if (enabled) scheduleTask(t);
                else if (taskTimers[id]) {
                    clearInterval(taskTimers[id]);
                    delete taskTimers[id];
                }
                addLogEntry(
                    enabled ? "ok" : "",
                    `Task "${t.name}" ${enabled ? "enabled" : "disabled"}`,
                );
            }

            function scheduleTask(task) {
                if (!task.enabled) return;
                const ms = parseInt(task.interval) * 60 * 1000;
                if (isNaN(ms) || ms <= 0) return;
                if (taskTimers[task.id]) clearInterval(taskTimers[task.id]);
                taskTimers[task.id] = setInterval(() => runTask(task), ms);
                addLogEntry(
                    "ok",
                    `Task "${task.name}" scheduled (${intervalLabel(task.interval)})`,
                );
            }

            async function runTask(task) {
                addLogEntry("", `Running "${task.name}"\u2026`);
                try {
                    const r = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: buildTaskPrompt(task),
                            history: [],
                        }),
                    });
                    const data = await r.json();
                    if (data.error)
                        addLogEntry(
                            "err",
                            `"${task.name}" error: ${data.error}`,
                        );
                    else {
                        addLogEntry("ok", `"${task.name}" completed`);
                        if (data.thread_events && data.thread_events.length > 0) {
                            const tool_execs = data.thread_events.filter(e => e.type === "tool_execution");
                            if (tool_execs.length > 0) {
                                for (const exec of tool_execs) {
                                    addLogEntry("ok", `Tool: ${exec.tool}`);
                                }
                            }
                        }
                        const doc = {
                            id: "doc_" + Date.now(),
                            title: `[Scheduled] ${task.name}`,
                            content: data.response || "",
                            createdAt: new Date().toISOString(),
                        };
                        researchDocs.unshift(doc);
                        localStorage.setItem(
                            "nullclaw_research_docs",
                            JSON.stringify(researchDocs),
                        );
                        renderDocList();
                    }
                } catch (e) {
                    addLogEntry("err", `"${task.name}" failed: ${e.message}`);
                }
            }

            function buildTaskPrompt(task) {
                const sourceCtx = task.sources.length
                    ? `Knowledge sources: ${task.sources.join(", ")}. `
                    : "";
                const prompts = {
                    summarize: `${sourceCtx}Summarize the key information from the knowledge sources into a concise markdown report.`,
                    diff: `${sourceCtx}Identify and describe what has changed since the last analysis of these sources.`,
                    report: `${sourceCtx}Generate a well-structured markdown report based on the current state of the knowledge sources.`,
                    alert: `${sourceCtx}Analyze the knowledge sources for anomalies, unexpected changes, or issues that require attention. List any alerts.`,
                    custom: task.prompt || "Please analyze and report.",
                };
                return prompts[task.action] || prompts.summarize;
            }

            function addLogEntry(type, msg) {
                const log = document.getElementById("run-log");
                if (!log) return;
                const ts = new Date().toLocaleTimeString();
                const cls = type === "ok" ? "ok" : type === "err" ? "err" : "";
                const entry = document.createElement("div");
                entry.className = "log-entry";
                entry.innerHTML = `<span class="ts">${ts}</span><span class="${cls}">${escHtml(msg)}</span>`;
                if (
                    log.querySelector(".log-entry span.ts")?.textContent ===
                    "--:--:--"
                )
                    log.innerHTML = "";
                log.appendChild(entry);
                log.scrollTop = log.scrollHeight;
            }

            // Start
            init();
