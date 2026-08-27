import { supabase, $, showMsg, clearMsg, friendlyAuthError, fmtDateTime, hoursUntil } from './portal.js';

const authCard = $('#auth');
const acctCard = $('#account');
const authMsg = $('#authMsg');
const acctMsg = $('#acctMsg');

const KIND_LABEL = {
  finance_data: 'Löschung der Cloud-Finanzdaten beantragt',
  account: 'Konto-Löschung beantragt',
};

function setBusy(busy) {
  document.querySelectorAll('button').forEach((b) => {
    if (!b.classList.contains('link')) b.disabled = busy;
  });
}

async function renderStatus() {
  clearMsg(acctMsg);
  const { data, error } = await supabase.rpc('get_my_deletion_status');
  const none = $('#statusNone');
  const pending = $('#statusPending');
  const done = $('#statusDone');
  none.classList.add('hidden');
  pending.classList.add('hidden');
  done.classList.add('hidden');

  if (error) {
    showMsg(acctMsg, 'error', 'Status konnte nicht geladen werden. Bitte neu laden.');
    none.classList.remove('hidden');
    return;
  }
  const status = data?.status ?? 'none';
  if (status === 'pending') {
    $('#pendingKind').textContent = KIND_LABEL[data.kind] || 'Löschung beantragt';
    const due = data.due;
    $('#pendingWhen').textContent = due
      ? 'Das Kulanzfenster ist abgelaufen. Die Löschung wird ausgeführt, sobald du die App das nächste Mal mit aktiver Synchronisierung öffnest' +
        (data.kind === 'account' ? ' bzw. hier abgeschlossen werden kann.' : '.')
      : `Wird wirksam am ${fmtDateTime(data.graceUntil)} (in ~${hoursUntil(data.graceUntil)} Stunden). Bis dahin stornierbar.`;
    pending.classList.remove('hidden');
  } else if (status === 'completed') {
    done.classList.remove('hidden');
  } else {
    none.classList.remove('hidden');
  }
}

async function refreshView() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    authCard.classList.add('hidden');
    acctCard.classList.remove('hidden');
    $('#acctEmail').textContent = session.user.email || session.user.id;
    await renderStatus();
  } else {
    acctCard.classList.add('hidden');
    authCard.classList.remove('hidden');
  }
}

$('#signInBtn').addEventListener('click', async () => {
  clearMsg(authMsg);
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) {
    showMsg(authMsg, 'error', 'Bitte E-Mail und Passwort eingeben.');
    return;
  }
  setBusy(true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setBusy(false);
  if (error) {
    showMsg(authMsg, 'error', friendlyAuthError(error));
    return;
  }
  $('#password').value = '';
  await refreshView();
});

$('#forgotBtn').addEventListener('click', async () => {
  clearMsg(authMsg);
  const email = $('#email').value.trim();
  if (!email) {
    showMsg(authMsg, 'error', 'Bitte zuerst deine E-Mail eingeben.');
    return;
  }
  setBusy(true);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname.replace(/[^/]+$/, '')}passwort-neu.html`,
  });
  setBusy(false);
  showMsg(
    authMsg,
    error ? 'error' : 'ok',
    error ? friendlyAuthError(error) : 'Falls ein Konto mit dieser E-Mail existiert, wurde eine E-Mail zum Zurücksetzen gesendet.',
  );
});

$('#signOutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  await refreshView();
});

async function requestDeletion(kind) {
  const label = kind === 'account' ? 'dein gesamtes Konto' : 'deine Cloud-Finanzdaten';
  if (!confirm(`Löschung für ${label} beantragen? Es beginnt ein 3-tägiges Kulanzfenster, in dem du stornieren kannst.`)) return;
  setBusy(true);
  const { error } = await supabase.rpc('request_data_deletion', { p_kind: kind });
  setBusy(false);
  if (error) {
    showMsg(acctMsg, 'error', 'Der Antrag konnte nicht gestellt werden. Bitte später erneut versuchen.');
    return;
  }
  await renderStatus();
  showMsg(acctMsg, 'ok', 'Antrag gestellt. Die Löschung wird nach 3 Tagen wirksam.');
}

$('#delFinanceBtn').addEventListener('click', () => requestDeletion('finance_data'));
$('#delAccountBtn').addEventListener('click', () => requestDeletion('account'));

$('#cancelBtn').addEventListener('click', async () => {
  setBusy(true);
  const { error } = await supabase.rpc('cancel_data_deletion');
  setBusy(false);
  if (error) {
    showMsg(acctMsg, 'error', 'Der Antrag konnte nicht storniert werden.');
    return;
  }
  await renderStatus();
  showMsg(acctMsg, 'ok', 'Der Löschantrag wurde storniert.');
});

supabase.auth.onAuthStateChange(() => { void refreshView(); });
void refreshView();
