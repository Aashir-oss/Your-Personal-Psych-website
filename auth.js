/* Your Personal Psych — auth + handoff to the Streamlit agent.
   Plain classic script: no ES modules, no CDN imports. The Supabase
   library is bundled locally as supabase-js.min.js.
   ----------------------------------------------------------------
   USERID CONTRACT (do not change):
   - Every signup generates a row in public.profiles whose userid (UUID
     primary key) is created by the database trigger (see supabase-setup.sql).
   - On every login we read that userid and send it to the agent as ?uid=.
   - The agent keys ALL sessions, records and history off that uid, so the
     same patient always maps to the same records.
   ---------------------------------------------------------------- */
(function () {
"use strict";

var errBox = document.getElementById("form-err");
var okBox = document.getElementById("form-ok");
var form = document.getElementById("auth-form");
var submitBtn = document.getElementById("submit-btn");
var tabLogin = document.getElementById("tab-login");
var tabSignup = document.getElementById("tab-signup");
var nameField = document.getElementById("name-field");
var authTitle = document.getElementById("auth-title");
var authSub = document.getElementById("auth-sub");

/* How long to wait for Supabase before calling it a timeout.
   Tests can override with window.__AUTH_TIMEOUT_MS. */
var TIMEOUT_MS = (typeof window !== "undefined" && window.__AUTH_TIMEOUT_MS) || 25000;

function showErr(msg) {
  okBox.classList.remove("show");
  errBox.textContent = msg;
  errBox.classList.add("show");
}
function showOk(msg) {
  errBox.classList.remove("show");
  okBox.textContent = msg;
  okBox.classList.add("show");
}
function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Please wait…" : (mode === "signup" ? "Create account →" : "Log in →");
}
function logErr(e) {
  if (typeof console !== "undefined" && console.error) console.error(e);
}

/* ---------- guards: library + config ---------- */
if (!window.supabase || !window.supabase.createClient) {
  showErr("The Supabase library did not load (supabase-js.min.js is missing from this folder). Re-extract the zip so all files are together.");
  window.__authReady = true; /* started, but cannot work without the library */
  return;
}
if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
  showErr("config.js did not load correctly — open it and make sure your keys are pasted inside the quotation marks, with nothing else changed.");
  window.__authReady = true;
  return;
}

/* ---------- login / signup tabs ---------- */
var mode = window.location.search.indexOf("mode=signup") !== -1 ? "signup" : "login";
function setMode(m) {
  mode = m;
  var isSignup = m === "signup";
  tabLogin.classList.toggle("active", !isSignup);
  tabSignup.classList.toggle("active", isSignup);
  nameField.style.display = isSignup ? "block" : "none";
  authTitle.textContent = isSignup ? "Create your space" : "Welcome back";
  authSub.textContent = isSignup
    ? "Just a name, email and password. Free, private, takes seconds."
    : "Log in to continue your reflection.";
  setBusy(false);
  errBox.classList.remove("show");
  okBox.classList.remove("show");
}
tabLogin.addEventListener("click", function () { setMode("login"); });
tabSignup.addEventListener("click", function () { setMode("signup"); });
setMode(mode);

/* ---------- Supabase client ---------- */
var supabase = null;
/* Trim: copy-paste often leaves a stray space, which breaks the URL. */
var CLEAN_URL = String(SUPABASE_URL).trim();
var CLEAN_KEY = String(SUPABASE_ANON_KEY).trim();
if (CLEAN_URL.indexOf("PASTE_") === 0 || CLEAN_KEY.indexOf("PASTE_") === 0) {
  showErr("This site isn't connected yet: paste your Supabase Project URL and Publishable key into config.js (see README).");
} else {
  try {
    supabase = window.supabase.createClient(CLEAN_URL, CLEAN_KEY);
  } catch (e) {
    logErr(e);
    showErr("Could not start the Supabase client: " + (e.message || e) + " — open config.js and check the Project URL is exactly like https://xyz.supabase.co with no extra spaces.");
  }
}

/* ---------- userid: primary key generated at signup ----------
   Read the patient's userid from public.profiles (created by the trigger).
   Falls back to the auth id (identical value) if the row isn't readable yet. */
function resolveUserId(user) {
  if (!supabase) return Promise.resolve(user.id);
  return supabase
    .from("profiles")
    .select("userid")
    .eq("userid", user.id)
    .single()
    .then(function (res) {
      if (!res.error && res.data && res.data.userid) return res.data.userid;
      return user.id;
    })
    .catch(function () { return user.id; });
}

/* ---------- THE HANDOFF: login/signup success -> agent ----------
   Full page navigation (window.location.href, NOT in-app routing) to the
   external Streamlit app, with the stable userid. */
var redirected = false;
function goToAgent() {
  if (redirected || !supabase) return Promise.resolve();
  return supabase.auth.getUser().then(function (res) {
    var user = res.data && res.data.user;
    if (!user) return;
    redirected = true;
    return resolveUserId(user).then(function (uid) {
      var meta = user.user_metadata || {};
      var name = encodeURIComponent(meta.full_name || user.email.split("@")[0]);
      window.location.href = AGENT_URL + "?uid=" + uid + "&name=" + name;
    });
  });
}

/* Fires on: fresh login, fresh signup (auto-confirm), email-verification
   return, and already-logged-in visits — every path ends at the agent. */
if (supabase) {
  supabase.auth.onAuthStateChange(function (event, session) {
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && session.user) {
      goToAgent();
    }
  });
  supabase.auth.getSession().then(function (res) {
    if (res.data.session && res.data.session.user) goToAgent();
  });
}

/* ---------- submit (hardened: no silent failure) ---------- */
form.addEventListener("submit", function (e) {
  e.preventDefault();
  try {
    if (!supabase) {
      showErr("The login service is not ready. Reload the page — if this keeps happening, check config.js.");
      return;
    }
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    var name = document.getElementById("name").value.trim();
    if (!email || !password) {
      showErr("Please enter your email and password.");
      return;
    }

    setBusy(true);
    showOk(mode === "signup" ? "Creating your account…" : "Logging you in…");

    /* Timeout: a request that never answers must say so, never hang silently. */
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      setBusy(false);
      showErr("No response from the server (timed out). Check your internet connection and that the Project URL in config.js is exactly right. Your account may have been created — try the Log in tab.");
    }, TIMEOUT_MS);

    function settle() {
      clearTimeout(timer);
      if (!timedOut) setBusy(false);
    }
    function fail(err) {
      if (timedOut) return;
      settle();
      logErr(err);
      showErr((err && err.message) || "Something went wrong. Please try again.");
    }
    function afterAuth() {
      /* The auth call finished. If we are still here and no redirect
         happened, say so instead of going quiet. */
      settle();
      if (!redirected && !timedOut) {
        showErr("Signed in, but the handoff to your agent didn't start. Please press Log in to continue.");
      }
    }

    if (mode === "signup") {
      supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name || email.split("@")[0] } }
      }).then(function (res) {
        if (timedOut) return;
        if (res.error) throw res.error;
        if (res.data.session && res.data.session.user) {
          return goToAgent().then(function () { afterAuth(); });
        }
        settle();
        showOk("Account created! Check your email to verify — you'll be taken to your agent right after.");
      }).catch(fail);
    } else {
      supabase.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (timedOut) return;
          if (res.error) throw res.error;
          if (res.data.user) return goToAgent().then(function () { afterAuth(); });
          settle();
        })
        .catch(fail);
    }
  } catch (err) {
    /* Synchronous throw (e.g. broken client) — never fail silently. */
    setBusy(false);
    logErr(err);
    showErr("Couldn't start the request: " + ((err && err.message) || err));
  }
});

/* Signal that the page started OK (used by the watchdog in auth.html) */
window.__authReady = true;
})();
