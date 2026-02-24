/**
 * Script: Escanear chats com não lidas, ler mensagens, gerar resumos.
 * Roda com browser VISÍVEL para o usuário acompanhar.
 */
import { chromium } from "playwright";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SERVER = process.env.CHATGURU_SERVER || "17";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_PATH = join(__dirname, "session.json");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log("=== Escaneando chats com mensagens não lidas ===\n");
console.log("Browser VISÍVEL — acompanhe na tela!\n");

const storageState = JSON.parse(await readFile(SESSION_PATH, "utf-8"));
const browser = await chromium.launch({ headless: false }); // VISÍVEL
const context = await browser.newContext({ storageState, permissions: ["notifications"] });
const page = await context.newPage();

// Navegar direto para /chats com tratamento robusto de timeout
console.log("Navegando para /chats...");
try {
  await page.goto(`https://s${SERVER}.expertintegrado.app/chats`, { waitUntil: "commit", timeout: 30000 });
  console.log(`  Resposta recebida: ${page.url()}`);
} catch (e) {
  console.log(`  Timeout no goto, verificando estado...`);
  console.log(`  URL atual: ${page.url()}`);
}

// Esperar a página renderizar (SPA pode demorar após "commit")
console.log("Aguardando SPA renderizar...");
await sleep(8000);
console.log(`  URL após espera: ${page.url()}`);

// Se caiu na página de login, sessão expirou
const isLogin = page.url().includes("login") || page.url().includes("signin");
if (isLogin) {
  console.error("ERRO: Sessão expirada. Execute: CHATGURU_SERVER=17 node login.js");
  await browser.close();
  process.exit(1);
}

// Aguardar cards de chat renderizarem
console.log("Aguardando cards de chat...");
try {
  await page.waitForSelector(".list__user-card", { timeout: 30000 });
  console.log("  Cards encontrados!");
} catch {
  console.log("  Cards não encontrados em 30s. Tentando navegar via JS...");
  await page.evaluate(() => { window.location.href = "/chats"; });
  await sleep(8000);
  await page.waitForSelector(".list__user-card", { timeout: 30000 }).catch(() => {
    console.log("  AVISO: Nenhum card encontrado. O site pode estar lento.");
  });
}
await sleep(2000);
console.log(`URL final: ${page.url()}`);

// Remover modais
await page.evaluate(() => {
  const beamer = document.querySelector("#beamerPushModal");
  if (beamer) beamer.remove();
  document.querySelectorAll(".modal.show, .modal.active, [role='dialog'].active").forEach(el => el.remove());
  document.querySelectorAll(".modal-backdrop, .push-overlay").forEach(el => el.remove());
});

// ── Passo 1: Filtrar por não lidas, ordenar por última mensagem (mais recente) ──
console.log("Ativando filtro: apenas não lidas...");
const unreadCb = await page.$(".list__single__filter.unread input[type='checkbox']");
if (unreadCb) { await unreadCb.click(); await sleep(3000); }

console.log("Ordenando por última mensagem (mais recente)...");
await page.selectOption("#selChatsOrder", "-date_last_message").catch(() => {});
await sleep(3000);

// ── Passo 2: Extrair lista de chats com não lidas ──
const chatList = await page.evaluate(() => {
  const result = [];
  const cards = document.querySelectorAll(".list__user-card");
  for (const card of cards) {
    const nameEl = card.querySelector(".user-name");
    const statusEl = card.querySelector("span.attendance__status");
    const unreadEl = card.querySelector("span.attendance__number");
    const timeEl = card.querySelector(".attendance__hour span");

    let chatStatus = statusEl?.textContent?.trim() || "";
    if (chatStatus === "EM ATENDI") chatStatus = "EM ATENDIMENTO";

    const unreadCount = unreadEl ? parseInt(unreadEl.textContent.trim(), 10) || 0 : 0;
    const timestamp = timeEl?.textContent?.trim() || "";

    result.push({
      contact_name: nameEl?.textContent?.trim() || "",
      status: chatStatus,
      unread_count: unreadCount,
      timestamp,
    });
  }
  return result;
});

console.log(`\nEncontrados ${chatList.length} chats com não lidas.\n`);

// Filtrar: excluir chats de teste e com timestamp "há X meses" > 30 dias
const recentChats = chatList.filter(c => {
  // Excluir se timestamp indica mais de 30 dias
  const ts = c.timestamp.toLowerCase();
  if (ts.includes("mês") || ts.includes("meses")) return false;
  if (ts.includes("ano") || ts.includes("anos")) return false;
  // "há X dias" — verificar se X > 30
  const diasMatch = ts.match(/há (\d+) dias?/);
  if (diasMatch && parseInt(diasMatch[1]) > 30) return false;
  // Incluir HH:MM (hoje), "há X dias" <= 30, "há X semanas"
  return true;
});

console.log(`Chats dos últimos 30 dias: ${recentChats.length}\n`);
recentChats.forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.contact_name} | ${c.status} | ${c.unread_count} não lidas | ${c.timestamp}`);
});

// ── Passo 3: Para cada chat, clicar → pegar chat_id → ler mensagens ──
const allResults = [];

for (let i = 0; i < recentChats.length; i++) {
  const chat = recentChats[i];
  console.log(`\n--- [${i + 1}/${recentChats.length}] Abrindo: ${chat.contact_name} ---`);

  // Clicar no card
  const cardClicked = await page.evaluate((chatName) => {
    const cards = document.querySelectorAll(".list__user-card");
    for (const card of cards) {
      const nameEl = card.querySelector(".user-name");
      if (nameEl?.textContent?.trim() === chatName) {
        card.click();
        return true;
      }
    }
    return false;
  }, chat.contact_name);

  if (!cardClicked) {
    console.log(`  SKIP: Não conseguiu clicar no card de ${chat.contact_name}`);
    continue;
  }

  await sleep(3000); // Aguardar chat abrir

  // Extrair chat_id da URL
  const currentUrl = page.url();
  const hashMatch = currentUrl.match(/#([a-f0-9]{24})/);
  const chatId = hashMatch ? hashMatch[1] : "";
  console.log(`  chat_id: ${chatId || "não encontrado"}`);

  // Aguardar mensagens carregarem
  await page.waitForSelector("#chat_messages_app", { timeout: 10000 }).catch(() => null);
  await sleep(2000);

  // Remover modais que possam bloquear scroll
  await page.evaluate(() => {
    const beamer = document.querySelector("#beamerPushModal");
    if (beamer) beamer.remove();
    document.querySelectorAll(".modal.show, .modal.active, [role='dialog'].active").forEach(el => el.remove());
    document.querySelectorAll(".modal-backdrop, .push-overlay").forEach(el => el.remove());
  });

  // Scroll para CIMA para carregar mais mensagens usando mouse.wheel real
  let msgCountBefore = 0;
  for (let scrollAttempt = 0; scrollAttempt < 10; scrollAttempt++) {
    // Contar mensagens atuais
    const currentCount = await page.evaluate(() => document.querySelectorAll(".row_msg").length);
    if (currentCount >= 40) break;
    if (currentCount === msgCountBefore && scrollAttempt > 1) break;
    msgCountBefore = currentCount;

    // Remover modais antes de scrollar
    await page.evaluate(() => {
      const beamer = document.querySelector("#beamerPushModal");
      if (beamer) beamer.remove();
      document.querySelectorAll(".modal-backdrop, .push-overlay").forEach(el => el.remove());
    });

    // Posicionar o mouse sobre o container de mensagens e scrollar com mouse.wheel REAL
    const chatContainer = await page.$("#chat_messages_app");
    if (chatContainer) {
      const box = await chatContainer.boundingBox();
      if (box) {
        // Posicionar mouse no centro do container
        await page.mouse.move(box.x + box.width / 2, box.y + 50);
        // Scroll para CIMA (deltaY negativo = scroll up)
        await page.mouse.wheel(0, -3000);
      }
    }

    console.log(`    Scroll UP ${scrollAttempt + 1}: ${currentCount} msgs visíveis, carregando mais...`);
    await sleep(2500);
  }

  // Extrair últimas 40 mensagens
  const messages = await page.evaluate((maxMsgs) => {
    const result = [];
    let currentDate = "";
    const container = document.querySelector("#chat_messages_app > div");
    if (!container) return result;

    // Coletar TODAS as mensagens primeiro, depois pegar as últimas N
    const allMsgs = [];
    for (const child of container.children) {
      if (child.classList.contains("msg-data")) {
        currentDate = child.textContent.trim();
        continue;
      }
      if (!child.classList.contains("row_msg")) continue;
      const msgContainer = child.querySelector(".msg-container");
      if (!msgContainer) continue;

      const isOutgoing = msgContainer.classList.contains("bg-sent-msg");
      const remetente = isOutgoing ? "atendente" : "cliente";
      const textEl = msgContainer.querySelector("span.msg-contentT");
      const texto = textEl?.innerText?.trim() || "";

      if (!texto) {
        const audioEl = msgContainer.querySelector("audio");
        if (audioEl) {
          const timeEl = msgContainer.querySelector("span.msg-timestamp");
          allMsgs.push({ remetente, horario: timeEl?.textContent?.trim() || "", data: currentDate, texto: "[Áudio]" });
        }
        continue;
      }

      const timeEl = msgContainer.querySelector("span.msg-timestamp");
      allMsgs.push({ remetente, horario: timeEl?.textContent?.trim() || "", data: currentDate, texto });
    }

    // Retornar as últimas N mensagens
    return allMsgs.slice(-maxMsgs);
  }, 40);

  console.log(`  ${messages.length} mensagens extraídas`);

  allResults.push({
    contact_name: chat.contact_name,
    status: chat.status,
    unread_count: chat.unread_count,
    timestamp: chat.timestamp,
    chat_id: chatId,
    messages,
  });

  // Voltar para a lista de chats (clicar na aba Chats)
  await page.evaluate(() => {
    const navItems = document.querySelectorAll(".nav-item");
    for (const item of navItems) {
      if (item.textContent.trim() === "Chats") {
        item.click();
        return;
      }
    }
  });
  await sleep(2000);

  // Re-aplicar filtros (a lista pode resetar ao voltar)
  // Na verdade o ChatGuru mantém os filtros, só precisa esperar
}

await browser.close();

// Salvar resultados
const outputPath = join(__dirname, "scan-results.json");
await writeFile(outputPath, JSON.stringify(allResults, null, 2));
console.log(`\n=== Scan completo! ${allResults.length} chats processados ===`);
console.log(`Resultados salvos em: scan-results.json`);
