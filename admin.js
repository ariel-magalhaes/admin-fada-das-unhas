import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const loginCard = document.getElementById("loginCard");
const painelCard = document.getElementById("painelCard");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const adminEmail = document.getElementById("adminEmail");
const adminSenha = document.getElementById("adminSenha");
const loginErro = document.getElementById("loginErro");

const filtroData = document.getElementById("filtroData");
const filtroStatus = document.getElementById("filtroStatus");
const listaAgendamentos = document.getElementById("listaAgendamentos");

const totalAgendamentos = document.getElementById("totalAgendamentos");
const totalPendentes = document.getElementById("totalPendentes");
const totalConfirmados = document.getElementById("totalConfirmados");
const totalCancelados = document.getElementById("totalCancelados");

const modoFaturamento = document.getElementById("modoFaturamento");
const campoFaturamentoData = document.getElementById("campoFaturamentoData");
const campoFaturamentoSemana = document.getElementById("campoFaturamentoSemana");
const campoFaturamentoMes = document.getElementById("campoFaturamentoMes");

const faturamentoData = document.getElementById("faturamentoData");
const faturamentoSemana = document.getElementById("faturamentoSemana");
const faturamentoMes = document.getElementById("faturamentoMes");

const fatTituloPeriodo = document.getElementById("fatTituloPeriodo");
const fatValorPeriodo = document.getElementById("fatValorPeriodo");
const fatDescricaoPeriodo = document.getElementById("fatDescricaoPeriodo");
const fatQuantidade = document.getElementById("fatQuantidade");
const fatTicketMedio = document.getElementById("fatTicketMedio");

const dataBloqueio = document.getElementById("dataBloqueio");
const btnBloquearData = document.getElementById("btnBloquearData");
const btnDesbloquearData = document.getElementById("btnDesbloquearData");
const bloqueioMensagem = document.getElementById("bloqueioMensagem");
const listaDatasBloqueadas = document.getElementById("listaDatasBloqueadas");

let unsubscribeLista = null;
let unsubscribeDatasBloqueadas = null;
let agendamentosTodosCache = [];
let agendamentosFiltradosCache = [];
let datasBloqueadasCache = [];

const hoje = new Date();
const hojeISO = formatarDataInput(hoje);

filtroData.value = hojeISO;
faturamentoData.value = hojeISO;
faturamentoSemana.value = obterValorSemanaInput(hoje);
faturamentoMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
dataBloqueio.value = hojeISO;
dataBloqueio.min = hojeISO;

btnLogin.addEventListener("click", async () => {
  loginErro.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      adminEmail.value.trim(),
      adminSenha.value.trim()
    );
  } catch (error) {
    console.error("Erro no login:", error);
    loginErro.textContent = "Não foi possível entrar. Verifique e-mail e senha.";
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

btnBloquearData.addEventListener("click", async () => {
  const data = dataBloqueio.value;

  if (!data) {
    mostrarMensagemBloqueio("Selecione uma data para bloquear.", true);
    return;
  }

  try {
    await setDoc(doc(db, "datas_bloqueadas", data), {
      data,
      criadoEm: new Date().toISOString()
    });

    mostrarMensagemBloqueio("Data bloqueada com sucesso.");
  } catch (error) {
    console.error("Erro ao bloquear data:", error);
    mostrarMensagemBloqueio("Não foi possível bloquear essa data.", true);
  }
});

btnDesbloquearData.addEventListener("click", async () => {
  const data = dataBloqueio.value;

  if (!data) {
    mostrarMensagemBloqueio("Selecione uma data para desbloquear.", true);
    return;
  }

  try {
    await deleteDoc(doc(db, "datas_bloqueadas", data));
    mostrarMensagemBloqueio("Data desbloqueada com sucesso.");
  } catch (error) {
    console.error("Erro ao desbloquear data:", error);
    mostrarMensagemBloqueio("Não foi possível desbloquear essa data.", true);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.classList.add("hidden");
    painelCard.classList.remove("hidden");
    btnLogout.classList.remove("hidden");
    carregarAgendamentos();
    carregarDatasBloqueadas();
  } else {
    loginCard.classList.remove("hidden");
    painelCard.classList.add("hidden");
    btnLogout.classList.add("hidden");

    if (unsubscribeLista) {
      unsubscribeLista();
      unsubscribeLista = null;
    }

    if (unsubscribeDatasBloqueadas) {
      unsubscribeDatasBloqueadas();
      unsubscribeDatasBloqueadas = null;
    }
  }
});

filtroData.addEventListener("change", aplicarFiltrosELimpezaVisual);
filtroStatus.addEventListener("change", aplicarFiltrosELimpezaVisual);

modoFaturamento.addEventListener("change", () => {
  atualizarCamposFaturamento();
  atualizarResumoFinanceiro();
});

faturamentoData.addEventListener("change", atualizarResumoFinanceiro);
faturamentoSemana.addEventListener("change", atualizarResumoFinanceiro);
faturamentoMes.addEventListener("change", atualizarResumoFinanceiro);

function mostrarMensagemBloqueio(texto, erro = false) {
  bloqueioMensagem.textContent = texto;
  bloqueioMensagem.classList.toggle("feedback-error", erro);
  bloqueioMensagem.classList.toggle("feedback-success", !erro);
}

function carregarDatasBloqueadas() {
  if (unsubscribeDatasBloqueadas) {
    unsubscribeDatasBloqueadas();
    unsubscribeDatasBloqueadas = null;
  }

  unsubscribeDatasBloqueadas = onSnapshot(
    collection(db, "datas_bloqueadas"),
    (snapshot) => {
      datasBloqueadasCache = snapshot.docs
        .map((item) => item.data()?.data)
        .filter(Boolean)
        .sort();

      renderizarDatasBloqueadas();
    },
    (error) => {
      console.error("Erro ao carregar datas bloqueadas:", error);
      listaDatasBloqueadas.innerHTML =
        '<div class="empty">Erro ao carregar datas bloqueadas.</div>';
    }
  );
}

function renderizarDatasBloqueadas() {
  if (!datasBloqueadasCache.length) {
    listaDatasBloqueadas.innerHTML =
      '<div class="empty">Nenhuma data bloqueada no momento.</div>';
    return;
  }

  listaDatasBloqueadas.innerHTML = datasBloqueadasCache
    .map((data) => {
      const dataFormatada = formatarDataBR(data);
      return `
        <div class="data-bloqueada-item">
          <span>${dataFormatada}</span>
          <button class="action-btn btn-cancelar btn-remover-bloqueio" data-data="${data}">
            Remover
          </button>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".btn-remover-bloqueio").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = btn.dataset.data;

      try {
        await deleteDoc(doc(db, "datas_bloqueadas", data));
        mostrarMensagemBloqueio("Data desbloqueada com sucesso.");
      } catch (error) {
        console.error("Erro ao remover bloqueio:", error);
        mostrarMensagemBloqueio("Não foi possível remover o bloqueio.", true);
      }
    });
  });
}

function aplicarFiltrosELimpezaVisual() {
  aplicarFiltrosLista();
  renderizarLista(agendamentosFiltradosCache);
}

function badgeStatus(status) {
  if (status === "confirmado") {
    return '<span class="badge badge-confirmado">Confirmado</span>';
  }
  if (status === "cancelado") {
    return '<span class="badge badge-cancelado">Cancelado</span>';
  }
  return '<span class="badge badge-pendente">Pendente</span>';
}

function atualizarResumo(lista) {
  totalAgendamentos.textContent = String(lista.length);
  totalPendentes.textContent = String(
    lista.filter((item) => item.status === "pendente").length
  );
  totalConfirmados.textContent = String(
    lista.filter((item) => item.status === "confirmado").length
  );
  totalCancelados.textContent = String(
    lista.filter((item) => item.status === "cancelado").length
  );
}

function renderizarLista(lista) {
  atualizarResumo(lista);

  if (!lista.length) {
    listaAgendamentos.innerHTML =
      '<div class="empty">Nenhum agendamento encontrado para esse filtro.</div>';
    return;
  }

  listaAgendamentos.innerHTML = lista
    .map(
      (item) => `
      <article class="agendamento-card">
        <div class="agendamento-topo">
          <div>
            <h3>${item.nome || "Sem nome"}</h3>
            <p>${item.data || "-"} às ${item.horario || "-"}</p>
          </div>
          ${badgeStatus(item.status)}
        </div>

        <div class="info-grid">
          <p><strong>E-mail:</strong> ${item.email || "-"}</p>
          <p><strong>Serviço:</strong> ${item.servico || "-"}</p>
          <p><strong>Quantidade:</strong> ${
            item.servico === "Reposição de unha" && item.quantidade
              ? `${item.quantidade} unha${item.quantidade > 1 ? "s" : ""}`
              : "-"
          }</p>
          <p><strong>Observação:</strong> ${item.observacao || "Nenhuma"}</p>
          <p><strong>ID:</strong> ${item.id}</p>
          <p><strong>Preço:</strong> ${formatarMoeda(Number(item.preco) || 0)}</p>
        </div>

        <div class="acoes">
          <button class="action-btn btn-confirmar" data-id="${item.id}" data-status="confirmado">Confirmar</button>
          <button class="action-btn btn-cancelar" data-id="${item.id}" data-status="cancelado">Cancelar</button>
          <button class="action-btn btn-pendente" data-id="${item.id}" data-status="pendente">Voltar para pendente</button>
        </div>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".action-btn[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.status;
      await atualizarStatus(id, status);
    });
  });
}

async function enviarEmailStatus(agendamento, novoStatus) {
  if (novoStatus === "pendente") {
    return;
  }

  let assunto = "";
  let titulo = "";
  let mensagem = "";

  if (novoStatus === "confirmado") {
    assunto = "Seu agendamento foi confirmado 💅";
    titulo = "Agendamento confirmado";
    mensagem = `Olá, ${agendamento.nome}! Seu agendamento foi confirmado para ${agendamento.data} às ${agendamento.horario}. Serviço: ${agendamento.servico}.`;
  } else if (novoStatus === "cancelado") {
    assunto = "Seu agendamento foi cancelado";
    titulo = "Agendamento cancelado";
    mensagem = `Olá, ${agendamento.nome}. Seu agendamento de ${agendamento.data} às ${agendamento.horario} foi cancelado.`;
  }

  try {
    await addDoc(collection(db, "mail"), {
      to: [agendamento.email],
      message: {
        subject: assunto,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>${titulo}</h2>
            <p>${mensagem}</p>
            <p><strong>Data:</strong> ${agendamento.data}</p>
            <p><strong>Horário:</strong> ${agendamento.horario}</p>
            <p><strong>Serviço:</strong> ${agendamento.servico}</p>
            <p>Fada das Unhas Esmalteria</p>
          </div>
        `
      }
    });
  } catch (error) {
    console.error("Erro ao criar documento de e-mail:", error);
  }
}

async function atualizarStatus(id, novoStatus) {
  try {
    const card = document
      .querySelector(`[data-id="${id}"]`)
      ?.closest(".agendamento-card");

    const nome = card?.querySelector("h3")?.textContent || "";
    const itemAtual = agendamentosTodosCache.find((item) => item.id === id);

    if (!itemAtual) return;

    await updateDoc(doc(db, "agendamentos", id), {
      status: novoStatus
    });

    await enviarEmailStatus(itemAtual, novoStatus);

    if (novoStatus === "confirmado") {
      alert(`Agendamento de ${nome} confirmado com sucesso.`);
    } else if (novoStatus === "cancelado") {
      alert(`Agendamento de ${nome} cancelado com sucesso.`);
    }
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    alert("Não foi possível atualizar o status agora.");
  }
}

function carregarAgendamentos() {
  if (unsubscribeLista) {
    unsubscribeLista();
    unsubscribeLista = null;
  }

  unsubscribeLista = onSnapshot(
    collection(db, "agendamentos"),
    (snapshot) => {
      agendamentosTodosCache = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));

      aplicarFiltrosLista();
      renderizarLista(agendamentosFiltradosCache);
      atualizarCamposFaturamento();
      atualizarResumoFinanceiro();
    },
    (error) => {
      console.error("Erro ao carregar agendamentos:", error);
      listaAgendamentos.innerHTML =
        '<div class="empty">Erro ao carregar agendamentos. Veja o console.</div>';
    }
  );
}

function aplicarFiltrosLista() {
  const dataSelecionada = filtroData.value;
  const statusSelecionado = filtroStatus.value;

  let lista = [...agendamentosTodosCache];

  if (dataSelecionada) {
    lista = lista.filter((item) => item.dataOriginal === dataSelecionada);
  }

  if (statusSelecionado) {
    lista = lista.filter((item) => item.status === statusSelecionado);
  }

  lista.sort((a, b) => {
    const dataA = `${a.dataOriginal || ""} ${a.horario || ""}`;
    const dataB = `${b.dataOriginal || ""} ${b.horario || ""}`;
    return dataA.localeCompare(dataB);
  });

  agendamentosFiltradosCache = lista;
}

function atualizarCamposFaturamento() {
  const modo = modoFaturamento.value;

  campoFaturamentoData.classList.add("hidden");
  campoFaturamentoSemana.classList.add("hidden");
  campoFaturamentoMes.classList.add("hidden");

  if (modo === "diario") {
    campoFaturamentoData.classList.remove("hidden");
  } else if (modo === "semanal") {
    campoFaturamentoSemana.classList.remove("hidden");
  } else {
    campoFaturamentoMes.classList.remove("hidden");
  }
}

function atualizarResumoFinanceiro() {
  const confirmados = agendamentosTodosCache.filter(
    (item) => item.status === "confirmado"
  );

  const modo = modoFaturamento.value;
  let filtrados = [];
  let titulo = "";
  let descricao = "";

  if (modo === "diario") {
    const dataSelecionada = faturamentoData.value;

    if (!dataSelecionada) {
      preencherFinanceiroVazio("Faturamento do dia", "Selecione uma data para visualizar.");
      return;
    }

    filtrados = confirmados.filter((item) => item.dataOriginal === dataSelecionada);

    titulo = "Faturamento do dia";
    descricao = `Período selecionado: ${formatarDataBR(dataSelecionada)}.`;
  }

  if (modo === "semanal") {
    const semanaSelecionada = faturamentoSemana.value;

    if (!semanaSelecionada) {
      preencherFinanceiroVazio("Faturamento da semana", "Selecione uma semana para visualizar.");
      return;
    }

    const { inicio, fim } = obterIntervaloDaSemana(semanaSelecionada);

    filtrados = confirmados.filter((item) => {
      if (!item.dataOriginal) return false;
      const dataItem = criarDataLocal(item.dataOriginal);
      return dataItem >= inicio && dataItem <= fim;
    });

    titulo = "Faturamento da semana";
    descricao = `Período selecionado: ${formatarDataBR(formatarDataInput(inicio))} até ${formatarDataBR(formatarDataInput(fim))}.`;
  }

  if (modo === "mensal") {
    const mesSelecionado = faturamentoMes.value;

    if (!mesSelecionado) {
      preencherFinanceiroVazio("Faturamento do mês", "Selecione um mês para visualizar.");
      return;
    }

    const [ano, mes] = mesSelecionado.split("-").map(Number);

    filtrados = confirmados.filter((item) => {
      if (!item.dataOriginal) return false;
      const dataItem = criarDataLocal(item.dataOriginal);
      return (
        dataItem.getFullYear() === ano &&
        dataItem.getMonth() + 1 === mes
      );
    });

    titulo = "Faturamento do mês";
    descricao = `Período selecionado: ${obterNomeMes(mes)}/${ano}.`;
  }

  const total = filtrados.reduce((acc, item) => acc + (Number(item.preco) || 0), 0);
  const quantidade = filtrados.length;
  const ticketMedio = quantidade ? total / quantidade : 0;

  fatTituloPeriodo.textContent = titulo;
  fatValorPeriodo.textContent = formatarMoeda(total);
  fatDescricaoPeriodo.textContent = descricao;
  fatQuantidade.textContent = String(quantidade);
  fatTicketMedio.textContent = formatarMoeda(ticketMedio);
}

function preencherFinanceiroVazio(titulo, descricao) {
  fatTituloPeriodo.textContent = titulo;
  fatValorPeriodo.textContent = formatarMoeda(0);
  fatDescricaoPeriodo.textContent = descricao;
  fatQuantidade.textContent = "0";
  fatTicketMedio.textContent = formatarMoeda(0);
}

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarDataInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function criarDataLocal(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function obterNomeMes(numeroMes) {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];

  return meses[numeroMes - 1] || "";
}

function obterInicioDaSemana(data) {
  const dataBase = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const dia = dataBase.getDay();
  const diferenca = dia === 0 ? -6 : 1 - dia;
  dataBase.setDate(dataBase.getDate() + diferenca);
  dataBase.setHours(0, 0, 0, 0);
  return dataBase;
}

function obterFimDaSemana(data) {
  const inicio = obterInicioDaSemana(data);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  fim.setHours(0, 0, 0, 0);
  return fim;
}

function obterValorSemanaInput(data) {
  const inicioSemana = obterInicioDaSemana(data);
  const quintaFeira = new Date(inicioSemana);
  quintaFeira.setDate(inicioSemana.getDate() + 3);

  const anoISO = quintaFeira.getFullYear();
  const primeiraSemana = new Date(anoISO, 0, 4);
  const inicioPrimeiraSemana = obterInicioDaSemana(primeiraSemana);
  const diferencaDias = Math.round(
    (quintaFeira - inicioPrimeiraSemana) / 86400000
  );
  const numeroSemana = Math.floor(diferencaDias / 7) + 1;

  return `${anoISO}-W${String(numeroSemana).padStart(2, "0")}`;
}

function obterIntervaloDaSemana(valorSemana) {
  const [anoTexto, semanaTexto] = valorSemana.split("-W");
  const ano = Number(anoTexto);
  const semana = Number(semanaTexto);

  const quartoDiaJaneiro = new Date(ano, 0, 4);
  const inicioPrimeiraSemana = obterInicioDaSemana(quartoDiaJaneiro);
  const inicio = new Date(inicioPrimeiraSemana);
  inicio.setDate(inicioPrimeiraSemana.getDate() + (semana - 1) * 7);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  fim.setHours(0, 0, 0, 0);

  return { inicio, fim };
}