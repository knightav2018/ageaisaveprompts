// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://ffzonxqruyzaaumbsckp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmem9ueHFydXl6YWF1bWJzY2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTk0NzcsImV4cCI6MjA4MDE3NTQ3N30.n_qLtNEdtaciijFOSuJQtfWjbO10CcuUfi5ClGK5838';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class PromptApp {
  constructor() {
    this.tg = window.Telegram.WebApp;
    this.userId = null;
    this.prompts = [];
    this.filter = 'all';

    this.dom = {
      title: document.getElementById('prompt-title'),
      content: document.getElementById('prompt-content'),
      cat: document.getElementById('prompt-category'),
      list: document.getElementById('prompts-list'),
      greeting: document.getElementById('user-greeting')
    };

    this.init();
  }

  async init() {
    this.tg.ready();
    this.tg.expand();

    // 1. User identification
    if (this.tg.initDataUnsafe?.user) {
      // Inside Telegram
      const user = this.tg.initDataUnsafe.user;
      this.userId = user.id;
      this.dom.greeting.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px;">person</span> Hello, ${user.first_name}!`;
      await this.syncUser(user);
    } else {
      // In browser (Chrome/Edge)
      this.userId = 11111;
      this.dom.greeting.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px;">person</span> Hello, Developer!`;
    }

    // 2. Load prompts
    await this.loadPrompts();
    this.bindEvents();
  }

  // Save user to database
  async syncUser(user) {
    const { error } = await supabase.from('users').upsert({
      telegram_id: user.id,
      first_name: user.first_name,
      username: user.username,
      language_code: user.language_code
    });
    if (error) console.error("User Sync Error:", error);
  }

  async loadPrompts() {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase Error:", error);
      this.dom.list.innerHTML = `<div class="loading">Error: ${error.message}</div>`;
      return;
    }

    this.prompts = data || [];
    this.render();
  }

  async handleAdd() {
    const title = this.dom.title.value.trim();
    const content = this.dom.content.value.trim();
    const category = this.dom.cat.value;

    if (!title || !content) return this.notify("Please fill all fields");

    const { data, error } = await supabase.from('prompts').insert({
      user_id: this.userId,
      title, content, category
    }).select();

    if (error) {
      console.error("Add Error:", error);
      this.notify("Failed to save: " + error.message);
    } else {
      if (this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('success');
      this.dom.title.value = '';
      this.dom.content.value = '';
      if (data && data[0]) {
        this.prompts.unshift(data[0]);
        this.render();
      } else {
        this.loadPrompts();
      }
    }
  }

  async deletePrompt(id) {
    const isConfirmed = confirm("Delete this prompt?");

    if (isConfirmed) {
      const { error } = await supabase.from('prompts').delete().eq('id', id);
      if (!error) {
        this.prompts = this.prompts.filter(p => p.id !== id);
        this.render();
      } else {
        this.notify("Delete failed");
      }
    }
  }

  notify(message) {
    if (this.tg.initDataUnsafe?.user && this.tg.showAlert) {
      this.tg.showAlert(message);
    } else {
      alert(message);
    }
  }

  bindEvents() {
    document.getElementById('add-btn').onclick = () => this.handleAdd();

    document.getElementById('filter-container').onclick = (e) => {
      const chip = e.target.closest('.filter-chip');
      if (chip) {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filter = chip.dataset.filter;
        this.render();
      }
    };

    document.getElementById('search-input').oninput = (e) => {
      this.render(e.target.value.toLowerCase());
    };

    this.dom.list.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('btn-delete')) this.deletePrompt(btn.dataset.id);
      if (btn.classList.contains('btn-copy')) {
        navigator.clipboard.writeText(btn.dataset.text);
        this.showToast();
      }
    };
  }

  render(search = '') {
    let list = this.prompts.filter(p => this.filter === 'all' || p.category === this.filter);
    if (search) list = list.filter(p => p.title.toLowerCase().includes(search) || p.content.toLowerCase().includes(search));

    if (list.length === 0) {
      this.dom.list.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>${this.prompts.length === 0 ? 'No prompts yet. Add one above!' : 'No prompts found matching filters.'}</p>
      </div>`;
      return;
    }

    this.dom.list.innerHTML = list.map(p => `
      <div class="prompt-item">
        <div class="prompt-header">
          <div class="prompt-title">${this.esc(p.title)}</div>
          <span class="prompt-badge">${p.category}</span>
        </div>
        <div class="prompt-content">${this.esc(p.content)}</div>
        <div class="prompt-footer">
          <span class="prompt-date">
            <span class="material-symbols-rounded" style="font-size: 14px;">schedule</span>
            ${new Date(p.created_at).toLocaleDateString()}
          </span>
          <div class="action-buttons">
            <button class="btn-icon btn-copy" data-id="${p.id}" data-text="${this.esc(p.content)}" title="Copy">
              <span class="material-symbols-rounded">content_copy</span>
            </button>
            <button class="btn-icon btn-delete" data-id="${p.id}" title="Delete">
              <span class="material-symbols-rounded">delete</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  esc(t) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return t ? t.replace(/[&<>"']/g, m => map[m]) : '';
  }

  showToast() {
    const t = document.getElementById('toast');
    t.className = 'show';
    setTimeout(() => t.className = '', 2000);
  }
}

new PromptApp();
