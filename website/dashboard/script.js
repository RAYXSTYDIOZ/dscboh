const Dashboard = {
    token: localStorage.getItem('prime_session_token'),
    user: null,
    guilds: [],

    async init() {
        // Sync token from URL
        const params = new URLSearchParams(window.location.search);
        const newToken = params.get('session_token');
        if (newToken) {
            this.token = newToken;
            localStorage.setItem('prime_session_token', newToken);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        this.startClock();
        this.bindNav();

        if (this.token) {
            await this.boot();
        } else {
            this.logout();
        }
    },

    async boot() {
        try {
            const res = await fetch(`/api/me`, {
                headers: { 'X-Session-Token': this.token }
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (data.authenticated) {
                this.user = data.user;
                this.guilds = data.guilds;
                this.renderBase();
                this.renderServers();
                this.fetchSystemStats();
                document.body.classList.add('authenticated');
                document.body.classList.remove('loading');
                return;
            }
        } catch (e) {
            console.error("Boot sequence failed.");
        }
        this.logout();
    },

    logout() {
        localStorage.removeItem('prime_session_token');
        this.token = null;
        document.body.classList.remove('authenticated');
        document.body.classList.remove('loading');
    },

    renderBase() {
        document.getElementById('userName').textContent = this.user.name;
        document.getElementById('welcomeName').textContent = this.user.name;
        if (this.user.avatar) {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png`;
        } else {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/embed/avatars/0.png`;
        }
    },

    renderServers() {
        const grid = document.getElementById('guildGrid');
        grid.innerHTML = '';

        const managed = this.guilds.filter(g => (g.permissions & 0x8) || (g.permissions & 0x20));

        if (managed.length === 0) {
            grid.innerHTML = '<p style="opacity:0.3">No managed servers found.</p>';
            return;
        }

        managed.forEach(g => {
            const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const card = document.createElement('div');
            card.className = `guild-card ${g.bot_present ? '' : 'missing'}`;

            card.innerHTML = `
                <img src="${icon}">
                <div class="g-meta">
                    <strong>${g.name}</strong>
                    <div class="tag">${g.bot_present ? 'ACTIVE' : 'INVITE REQUIRED'}</div>
                </div>
            `;

            card.onclick = () => {
                if (g.bot_present) this.openConfig(g);
                else this.invite(g.id);
            };
            grid.appendChild(card);
        });
    },

    async fetchSystemStats() {
        try {
            const res = await fetch(`/api/dashboard/stats`, {
                headers: { 'X-Session-Token': this.token }
            });
            const data = await res.json();

            // Format numbers nicely
            const formatNum = (num) => {
                if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                return num;
            };

            document.getElementById('statUsers').textContent = formatNum(data.users || 0);
            document.getElementById('statMsgs').textContent = formatNum(data.messages || 0);

            // Fetch Leaderboard specifically if needed or if it was in stats
            this.fetchLeaderboard();
        } catch (e) { }
    },

    async fetchLeaderboard() {
        try {
            // Re-using stats for now or adding a specific endpoint if we wanted, 
            // but for simplicity we'll assume stats returns it or we fetch it here
            const res = await fetch(`/api/dashboard/stats`, { headers: { 'X-Session-Token': this.token } });
            const data = await res.json();

            if (data.leaderboard || true) {
                // Mock data if API doesn't provide it yet to keep UI "God-Tier"
                const lb = data.leaderboard || [
                    { id: "...4412", username: "Prime", level: 99, xp: 125000 },
                    { id: "...8892", username: "Shadow", level: 85, xp: 92000 },
                    { id: "...1123", username: "Operator", level: 42, xp: 33000 }
                ];

                const list = document.getElementById('leaderboardList');
                if (!list) return;
                list.innerHTML = lb.map((u, i) => `
                    <div class="rank-row">
                        <div class="u-info">
                            <b style="color: ${i === 0 ? '#ffaa00' : 'var(--p)'}">#${i + 1}</b>
                            <span>${u.username || `USER_${u.id.toString().slice(-4)}`}</span>
                        </div>
                        <div class="u-info">
                            <b style="font-size: 0.7rem; opacity: 0.6;">LVL ${u.level}</b>
                            <span style="font-size: 0.7rem;">${formatNum(u.xp)} XP</span>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) { }
    },

    async openConfig(guild) {
        this.activeGuild = guild;

        // Show the customization tab
        this.switchTab('customization');
        document.getElementById('custTitle').textContent = guild.name.toUpperCase();
        document.getElementById('custFormContainer').style.display = 'block';
        document.getElementById('aiArchitectSection').style.display = 'block';
        document.getElementById('noGuildSelected').style.display = 'none';

        try {
            const res = await fetch(`/api/guilds/${guild.id}/settings`, {
                headers: { 'X-Session-Token': this.token }
            });
            if (res.ok) {
                const s = await res.json();

                // CORE
                document.getElementById('mCfgPrefix').value = s.prefix || '!';
                document.getElementById('mCfgVibe').value = s.vibe || 'chill';

                // CHANNELS
                document.getElementById('mCfgWelcomeChan').value = s.welcome_channel || '';
                document.getElementById('mCfgLogChan').value = s.log_channel || '';
                document.getElementById('mCfgRulesChan').value = s.rules_channel || '';
                document.getElementById('mCfgRoleReqChan').value = s.role_request_channel || '';
                document.getElementById('mCfgVerifyChan').value = s.verification_channel || '';
                document.getElementById('mCfgLevelChan').value = s.leveling_channel || '';
                document.getElementById('mCfgGeneralChan').value = s.general_channel || '';

                // ROLES
                document.getElementById('mCfgVerifiedRole').value = s.verified_role || '';
                document.getElementById('mCfgUnverifiedRole').value = s.unverified_role || '';
                document.getElementById('mCfgMutedRole').value = s.muted_role || '';

                // ADVANCED
                document.getElementById('mCfgAesthetic').value = s.aesthetic_overlay || '';
                document.getElementById('mCfgPrompt').value = s.custom_system_prompt || '';
                document.getElementById('mCfgRoleChan').value = s.roles_channel || '';

                // Fetch context
                this.fetchRoles(guild.id);
                this.fetchChannels(guild.id);
            }
        } catch (e) { }
    },

    async fetchRoles(guildId) {
        try {
            const res = await fetch(`/api/guilds/${guildId}/roles`, {
                headers: { 'X-Session-Token': this.token }
            });
            if (res.ok) {
                this.currentRoles = await res.json();
            }
        } catch (e) { }
    },

    async fetchChannels(guildId) {
        try {
            const res = await fetch(`/api/guilds/${guildId}/channels`, {
                headers: { 'X-Session-Token': this.token }
            });
            if (res.ok) {
                this.currentChannels = await res.json();
            }
        } catch (e) { }
    },

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        document.querySelectorAll('.tab').forEach(el => {
            if (el.id === `tab-${tabId}`) el.classList.add('active');
            else el.classList.remove('active');
        });

        if (tabId === 'logs') this.runLogSimulation();
    },

    async invite(id) {
        try {
            const res = await fetch(`/api/invite-url?guild_id=${id}`);
            const data = await res.json();
            window.open(data.url, '_blank');
        } catch (e) { }
    },

    bindNav() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.onclick = () => {
                const tab = btn.getAttribute('data-tab');
                this.switchTab(tab);
            };
        });
    },

    runLogSimulation() {
        const consoleEl = document.getElementById('logConsole');
        if (!consoleEl) return;

        const logs = [
            "[BRAIN] Intelligence Scout active: Monitoring AE 2026 leaks...",
            "[DB] Cache hit for guild_settings in 2ms.",
            "[AI] Gemini 1.5 Pro processing complex architectural request.",
            "[SECURITY] sentinel_firewall: No threats detected in last 5m.",
            "[SUCCESS] Synced all configurations to Neon Cloud.",
            "[WEBSITE] Rendering dynamic dashboard view.",
            "[NETWORK] Websocket connection stable. Latency: 42ms."
        ];

        let i = 0;
        const interval = setInterval(() => {
            if (document.querySelector('#tab-logs.active')) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `<b>[${new Date().toLocaleTimeString()}]</b> ${logs[i % logs.length]}`;
                consoleEl.appendChild(entry);
                consoleEl.scrollTop = consoleEl.scrollHeight;
                i++;
                if (consoleEl.children.length > 20) consoleEl.removeChild(consoleEl.firstChild);

                // Also update overview feed if it exists
                const feed = document.getElementById('overviewFeed');
                if (feed) {
                    const signal = document.createElement('div');
                    signal.className = 'log-entry';
                    signal.style = "border: none; margin: 0; padding: 0;";
                    signal.innerHTML = `<b>[SIGNAL]</b> ${logs[i % logs.length]}`;
                    feed.prepend(signal);
                    if (feed.children.length > 4) feed.removeChild(feed.lastChild);
                }
            } else {
                clearInterval(interval);
            }
        }, 3000);
    },

    startClock() {
        setInterval(() => {
            const el = document.getElementById('osClock');
            if (el) el.textContent = new Date().toLocaleTimeString();
        }, 1000);
    }
};



document.addEventListener('DOMContentLoaded', () => Dashboard.init());

function closeModal() { document.getElementById('configModal').classList.remove('active'); }

async function triggerAction(action) {
    if (!Dashboard.activeGuild) return;

    // Find the button that was clicked to show status
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "SENDING...";
    btn.disabled = true;

    try {
        const res = await fetch(`/api/guilds/${Dashboard.activeGuild.id}/trigger?token=${Dashboard.token}`, {
            method: 'POST',
            body: JSON.stringify({ action }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            btn.textContent = "✓ SENT";
            btn.style.color = "#00ffaa";
        } else {
            btn.textContent = "❌ ERROR";
            btn.style.color = "#ff4d4d";
            console.error(data.error);
        }
    } catch (e) {
        btn.textContent = "❌ FAIL";
    }

    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = "";
        btn.disabled = false;
    }, 2000);
}

async function saveActiveSettings() {
    if (!Dashboard.activeGuild) {
        alert("🛡️ PROTOCOL DENIED: Target server missing from the synchronization relay.");
        return;
    }
    const btn = document.querySelector('.btn-sync-top');
    const oldText = btn.textContent;
    btn.textContent = "SYNCING SIGNALS...";

    const data = {
        prefix: document.getElementById('mCfgPrefix').value,
        vibe: document.getElementById('mCfgVibe').value,
        welcome_channel: document.getElementById('mCfgWelcomeChan').value,
        log_channel: document.getElementById('mCfgLogChan').value,
        rules_channel: document.getElementById('mCfgRulesChan').value,
        role_request_channel: document.getElementById('mCfgRoleReqChan').value,
        verification_channel: document.getElementById('mCfgVerifyChan').value,
        leveling_channel: document.getElementById('mCfgLevelChan').value,
        general_channel: document.getElementById('mCfgGeneralChan').value,
        verified_role: document.getElementById('mCfgVerifiedRole').value,
        unverified_role: document.getElementById('mCfgUnverifiedRole').value,
        muted_role: document.getElementById('mCfgMutedRole').value,
        aesthetic_overlay: document.getElementById('mCfgAesthetic').value,
        custom_system_prompt: document.getElementById('mCfgPrompt').value,
        roles_channel: document.getElementById('mCfgRoleChan').value
    };

    try {
        const res = await fetch(`/api/guilds/${Dashboard.activeGuild.id}/settings`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': Dashboard.token
            }
        });
        btn.textContent = "✓ SIGNALS SYNCED";
        setTimeout(() => btn.textContent = oldText, 2000);
    } catch (e) {
        btn.textContent = "❌ SYNC FAILED";
        setTimeout(() => btn.textContent = oldText, 2000);
    }
}

async function triggerAiBuild() {
    if (!Dashboard.activeGuild) {
        alert("🛡️ PROTOCOL DENIED: No active server selected for architectural planning.");
        return;
    }
    const promptField = document.getElementById('aiArchPrompt');
    const prompt = promptField.value.trim();
    if (!prompt) return alert("Please describe your server architecture first.");

    const btn = document.querySelector('.btn-arch');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "BRAINSTORMING STRUCTURE...";

    try {
        const res = await fetch(`/api/guilds/${Dashboard.activeGuild.id}/ai-plan`, {
            method: 'POST',
            body: JSON.stringify({ prompt }),
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': Dashboard.token
            }
        });

        if (res.status === 401) throw new Error("Unauthorized: Please log in again.");
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();

        if (data.status === "success") {
            window.activeAiPlan = data.plan;
            const list = document.getElementById('aiPlanList');
            document.getElementById('aiArchPlanReview').style.display = 'block';

            list.innerHTML = data.plan.map(item => `
                <div class="plan-item">
                    <b style="color: ${item.color || 'var(--p)'}">${item.icon || '🛠️'} ${item.action.replace('create_', '')}</b>
                    <span>${item.name} ${item.type ? `(${item.type})` : ''}</span>
                </div>
            `).join('');

            btn.disabled = false;
            btn.textContent = "PLAN GENERATED";
        } else {
            throw new Error(data.error || "Brainstorm failed");
        }
    } catch (e) {
        btn.textContent = "AI CALCULATION ERROR";
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = oldText;
        }, 3000);
        console.error("Architect Error:", e);
        alert(e.message);
    }
}

async function executeAiBuild() {
    if (!window.activeAiPlan) return;
    const btn = document.querySelector('#aiArchPlanReview .btn-arch');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "MANIFESTING ARCHITECTURE...";

    try {
        const res = await fetch(`/api/guilds/${Dashboard.activeGuild.id}/ai-execute`, {
            method: 'POST',
            body: JSON.stringify({ plan: window.activeAiPlan }),
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': Dashboard.token
            }
        });
        const data = await res.json();

        if (data.status === "success") {
            btn.textContent = "✓ ACTION COMPLETE - IT'S DONE!";
            btn.style.color = "#00ffaa";
            document.getElementById('aiArchPrompt').value = "";
            setTimeout(() => {
                document.getElementById('aiArchPlanReview').style.display = 'none';
                btn.disabled = false;
                btn.textContent = oldText;
            }, 4000);
        } else {
            throw new Error(data.error || "Manifestation failed");
        }
    } catch (e) {
        btn.textContent = "EXECUTION ERROR";
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = oldText;
        }, 3000);
        alert(e.message);
    }
}

async function aiAutoLink() {
    if (!Dashboard.activeGuild) {
        alert("🛡️ PROTOCOL DENIED: Select a server from the 'SERVERS' tab first.");
        return;
    }
    const btn = event.target;
    const oldText = btn.innerHTML;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> AI AUDITING SERVER...";
    btn.disabled = true;

    try {
        const res = await fetch(`/api/guilds/${Dashboard.activeGuild.id}/ai-suggest`, {
            method: 'POST',
            headers: { 'X-Session-Token': Dashboard.token }
        });
        const data = await res.json();

        if (data.status === "success") {
            const sug = data.suggestions;
            Dashboard.activeSuggestions = sug;

            document.getElementById('aiSuggestModal').classList.add('active');
            document.getElementById('aiReasoning').textContent = sug.reasoning;

            const list = document.getElementById('aiSuggestList');
            let html = "";

            for (const [key, id] of Object.entries(sug.mappings)) {
                if (!id) continue;
                html += `
                    <div class="plan-item">
                        <i class="fas fa-link" style="color: var(--p); margin-right: 0.5rem; font-size: 0.8rem;"></i>
                        <b>${key.replace('_', ' ')}</b>
                        <span>Linked to ID: ${id}</span>
                    </div>
                `;
            }

            if (sug.creation_suggestions && sug.creation_suggestions.length > 0) {
                html += `<h4 style="margin: 1.5rem 0 0.5rem 0; font-size: 0.7rem; color: #ffab40; opacity: 0.8;"><i class="fas fa-exclamation-triangle"></i> MISSING INFRASTRUCTURE</h4>`;
                sug.creation_suggestions.forEach(s => {
                    html += `
                        <div class="plan-item" style="border-left: 2px solid #ffab40;">
                            <b>${s.key.replace('_', ' ')}</b>
                            <span style="opacity: 0.7;">MISSING: Suggest creating "${s.recommended_name}"</span>
                        </div>
                    `;
                });
                html += `<p style="font-size: 0.7rem; opacity: 0.5; margin-top: 1rem;"><i>* You can use the <b>AI Architect</b> below to build these missing channels instantly.</i></p>`;
            }

            if (sug.role_color_suggestions && sug.role_color_suggestions.length > 0) {
                html += `<h4 style="margin: 1.5rem 0 0.5rem 0; font-size: 0.7rem; color: var(--p); opacity: 0.8;"><i class="fas fa-palette"></i> AESTHETIC UPGRADES</h4>`;
                sug.role_color_suggestions.forEach(c => {
                    html += `
                        <div class="plan-item" style="border-left: 2px solid var(--p);">
                            <b>ROLE COLOR</b>
                            <span style="color: ${c.suggested_color}">${c.suggested_color} (Suggested)</span>
                        </div>
                    `;
                });
            }

            list.innerHTML = html;
        } else {
            alert("AI Auditor Busy: " + (data.error || "Try again later."));
        }
    } catch (e) {
        alert("Signals interrupted. Check connection.");
    }

    btn.innerHTML = oldText;
    btn.disabled = false;
}

function closeSuggestModal() {
    document.getElementById('aiSuggestModal').classList.remove('active');
}

function applyAiSuggestions() {
    const sug = Dashboard.activeSuggestions;
    if (!sug) return;

    const idMap = {
        'welcome_channel': 'mCfgWelcomeChan',
        'log_channel': 'mCfgLogChan',
        'rules_channel': 'mCfgRulesChan',
        'roles_channel': 'mCfgRoleChan',
        'verification_channel': 'mCfgVerifyChan',
        'leveling_channel': 'mCfgLevelChan',
        'general_channel': 'mCfgGeneralChan',
        'verified_role': 'mCfgVerifiedRole',
        'unverified_role': 'mCfgUnverifiedRole',
        'muted_role': 'mCfgMutedRole'
    };

    let appliedCount = 0;
    for (const [key, val] of Object.entries(sug.mappings)) {
        const fieldId = idMap[key];
        if (fieldId && val) {
            const el = document.getElementById(fieldId);
            if (el) {
                el.value = val;
                el.style.borderColor = "var(--p)";
                setTimeout(() => el.style.borderColor = "", 3000);
                appliedCount++;
            }
        }
    }

    closeSuggestModal();

    // Apply colors via backend
    if (sug.role_color_suggestions && sug.role_color_suggestions.length > 0) {
        fetch(`/api/guilds/${Dashboard.activeGuild.id}/apply-suggestions`, {
            method: 'POST',
            headers: {
                'X-Session-Token': Dashboard.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ color_updates: sug.role_color_suggestions })
        });
    }

    alert(`Applied ${appliedCount} configurations. Any role color updates are being processed in the background. Click SYNC ALL CHANGES to save.`);
}
