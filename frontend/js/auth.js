const API = "/api/auth";

async function signup() {
  const body = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    password: document.getElementById("password").value
  };

  const res = await fetch(`${API}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  document.getElementById("msg").textContent = data.message;

  if (data.success) location.href = "login.html";
}

async function login() {
  const body = {
    identifier: document.getElementById("identifier").value,
    password: document.getElementById("password").value
  };

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  document.getElementById("msg").textContent = data.message;

  if (data.success) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    location.href = "chat.html";
  }
}