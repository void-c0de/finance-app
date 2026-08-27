import { supabase, $, showMsg } from './portal.js';

const msg = $('#msg');
const form = $('#form');
let recovered = false;

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
    recovered = true;
    showMsg(msg, 'ok', 'Link bestätigt. Bitte ein neues Passwort wählen.');
    form.classList.remove('hidden');
  }
});

// Fallback if the event fired before this listener attached.
setTimeout(async () => {
  if (recovered) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showMsg(msg, 'ok', 'Bitte ein neues Passwort wählen.');
    form.classList.remove('hidden');
  } else {
    showMsg(msg, 'error', 'Dieser Link ist ungültig oder abgelaufen. Fordere über die Kontolöschungs-Seite einen neuen an.');
  }
}, 1500);

$('#saveBtn').addEventListener('click', async () => {
  const pw1 = $('#pw1').value;
  const pw2 = $('#pw2').value;
  if (pw1.length < 12) {
    showMsg(msg, 'error', 'Das Passwort muss mindestens 12 Zeichen haben.');
    return;
  }
  if (pw1 !== pw2) {
    showMsg(msg, 'error', 'Die beiden Passwörter stimmen nicht überein.');
    return;
  }
  $('#saveBtn').disabled = true;
  const { error } = await supabase.auth.updateUser({ password: pw1 });
  $('#saveBtn').disabled = false;
  if (error) {
    showMsg(msg, 'error', error.message || 'Das Passwort konnte nicht gesetzt werden.');
    return;
  }
  form.classList.add('hidden');
  showMsg(msg, 'ok', 'Passwort geändert. Du kannst dich jetzt wieder anmelden.');
  await supabase.auth.signOut();
});
