/* ================================================================
   settings.js — My Account, User Management, Store Settings
================================================================ */

var _currentRole = null;
var _currentUserId = null;

document.addEventListener('DOMContentLoaded', async function() {
  await loadComponent('sidebar-container', '/components/sidebar.html');
  await loadComponent('topbar-container',  '/components/topbar.html');
  await checkSession();
  setActivePage('settings');
  setTopbar('Settings', 'Settings');
  await loadAccountInfo();
});

// ── Tab switching ──────────────────────────────────────────
function switchTab(tab) {
  ['account', 'users', 'store'].forEach(function(t) {
    document.getElementById('content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'users')  loadUsers();
  if (tab === 'store')  loadStoreSettings();
}

// ── Account info ───────────────────────────────────────────
async function loadAccountInfo() {
  var res = await apiFetch('/auth/status');
  if (!res.ok) return;
  var d = res.data;
  _currentRole   = d.role;
  _currentUserId = d.userId;
  document.getElementById('account-username').textContent = d.username || '—';
  document.getElementById('account-avatar').textContent   = (d.username || '?')[0].toUpperCase();
  var badge = document.getElementById('account-role');
  badge.textContent  = capitalize(d.role || '');
  badge.className    = 'sett-role-badge sett-role-' + (d.role || 'cashier');

  // Show Users tab only to admins/managers
  if (d.role === 'admin' || d.role === 'manager') {
    document.getElementById('tab-users').style.display = '';
  } else {
    document.getElementById('tab-users').style.display = 'none';
  }
}

// ── Change password ────────────────────────────────────────
async function changePassword() {
  var cur  = document.getElementById('pw-current').value.trim();
  var nw   = document.getElementById('pw-new').value.trim();
  var conf = document.getElementById('pw-confirm').value.trim();

  if (!cur || !nw || !conf) { showToast('All password fields are required.', 'amber'); return; }
  if (nw !== conf)          { showToast('New passwords do not match.', 'amber'); return; }
  if (nw.length < 6)        { showToast('New password must be at least 6 characters.', 'amber'); return; }

  var btn = document.getElementById('btn-change-pw');
  btn.disabled = true; btn.textContent = 'Saving...';

  var res = await apiFetch('/auth/password', 'PUT', { current_password: cur, new_password: nw });
  btn.disabled = false; btn.textContent = 'Change Password';

  if (res.ok) {
    showToast('Password changed successfully!', 'green');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value     = '';
    document.getElementById('pw-confirm').value = '';
  } else {
    showToast(res.data.error || 'Could not change password.', 'amber');
  }
}

// ── User management ────────────────────────────────────────
async function loadUsers() {
  var res = await apiFetch('/auth/users');
  if (res.status === 403) {
    document.getElementById('users-table-card').style.display = 'none';
    document.getElementById('admin-only-msg').style.display   = '';
    return;
  }
  if (!res.ok) { showToast('Could not load users.', 'amber'); return; }

  document.getElementById('users-table-card').style.display = '';
  document.getElementById('admin-only-msg').style.display   = 'none';

  // Only admins can add/delete users
  document.querySelector('button[onclick="showAddUser()"]').style.display =
    _currentRole === 'admin' ? '' : 'none';

  renderUsersTable(res.data);
}

function renderUsersTable(users) {
  var tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-6);color:var(--slate-400)">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(function(u) {
    var isMe = (u.username === document.getElementById('account-username').textContent);
    var roleSelect = _currentRole === 'admin' && !isMe
      ? '<select class="sett-role-sel" onchange="changeRole(' + u.id + ', this.value)">' +
          ['admin','manager','cashier'].map(function(r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + capitalize(r) + '</option>';
          }).join('') +
        '</select>'
      : '<span class="sett-role-badge sett-role-' + u.role + '">' + capitalize(u.role) + '</span>';

    var actions = (_currentRole === 'admin' && !isMe)
      ? '<button class="btn-danger sett-del-btn" onclick="deleteUser(' + u.id + ', \'' + escH(u.username) + '\')">Delete</button>'
      : (isMe ? '<span style="font-size:var(--text-xs);color:var(--slate-400)">You</span>' : '');

    return '<tr>' +
      '<td class="sett-uname">' + escH(u.username) + '</td>' +
      '<td style="color:var(--slate-500)">' + escH(u.email || '—') + '</td>' +
      '<td>' + roleSelect + '</td>' +
      '<td style="color:var(--slate-400);font-size:var(--text-xs)">' + fmtDate(u.created_at) + '</td>' +
      '<td style="text-align:right">' + actions + '</td>' +
    '</tr>';
  }).join('');
}

async function changeRole(userId, role) {
  var res = await apiFetch('/auth/users/' + userId + '/role', 'PUT', { role: role });
  if (res.ok) {
    showToast('Role updated.', 'green');
  } else {
    showToast(res.data.error || 'Could not update role.', 'amber');
    loadUsers(); // reload to reset dropdown
  }
}

async function deleteUser(userId, username) {
  if (!confirm('Delete user "' + username + '"? This cannot be undone.')) return;
  var res = await apiFetch('/auth/users/' + userId, 'DELETE');
  if (res.ok) {
    showToast('User deleted.', 'green');
    loadUsers();
  } else {
    showToast(res.data.error || 'Could not delete user.', 'amber');
  }
}

function showAddUser() {
  document.getElementById('add-user-card').style.display = '';
}

function hideAddUser() {
  document.getElementById('add-user-card').style.display = 'none';
  document.getElementById('new-username').value  = '';
  document.getElementById('new-email').value     = '';
  document.getElementById('new-password').value  = '';
  document.getElementById('new-role').value      = 'cashier';
}

async function addUser() {
  var username = document.getElementById('new-username').value.trim();
  var email    = document.getElementById('new-email').value.trim();
  var password = document.getElementById('new-password').value;
  var role     = document.getElementById('new-role').value;

  if (!username || !email || !password) { showToast('All fields are required.', 'amber'); return; }

  var btn = document.getElementById('btn-add-user');
  btn.disabled = true; btn.textContent = 'Adding...';

  var res = await apiFetch('/auth/register', 'POST', { username, email, password, role });
  btn.disabled = false; btn.textContent = 'Add User';

  if (res.ok) {
    showToast('User added!', 'green');
    hideAddUser();
    loadUsers();
  } else {
    showToast(res.data.error || 'Could not add user.', 'amber');
  }
}

// ── Store settings (localStorage) ─────────────────────────
var STORE_KEY = 'stockeasy_store_settings';

function loadStoreSettings() {
  var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  document.getElementById('store-name').value    = s.name    || '';
  document.getElementById('store-gst').value     = s.gst     || '';
  document.getElementById('store-phone').value   = s.phone   || '';
  document.getElementById('store-address').value = s.address || '';
}

function saveStoreSettings() {
  var s = {
    name:    document.getElementById('store-name').value.trim(),
    gst:     document.getElementById('store-gst').value.trim(),
    phone:   document.getElementById('store-phone').value.trim(),
    address: document.getElementById('store-address').value.trim()
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
  showToast('Store settings saved!', 'green');
}

// ── Helpers ────────────────────────────────────────────────
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escH(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
