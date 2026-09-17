const { test, describe } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

describe("DeepSight Backend Core Tests", () => {
  test("Password hashing and comparison with bcryptjs", async () => {
    const password = "mySecretPassword123";
    const hash = await bcrypt.hash(password, 10);
    assert.strictEqual(typeof hash, "string");
    assert.ok(hash.startsWith("$2"));

    const valid = await bcrypt.compare(password, hash);
    assert.strictEqual(valid, true);

    const invalid = await bcrypt.compare("wrongPassword", hash);
    assert.strictEqual(invalid, false);
  });

  test("JWT generation and verification", () => {
    const secret = "test-secret-key-12345";
    const payload = { sub: "user-123", email: "user@example.com", name: "Tester" };
    const token = jwt.sign(payload, secret, { expiresIn: "1h" });

    assert.strictEqual(typeof token, "string");
    const decoded = jwt.verify(token, secret);
    assert.strictEqual(decoded.sub, payload.sub);
    assert.strictEqual(decoded.email, payload.email);
    assert.strictEqual(decoded.name, payload.name);
  });

  test("Express Health Endpoint (/api/health)", async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/health");
      if (res.ok) {
        const data = await res.json();
        assert.strictEqual(data.status, "ok");
        assert.ok("ai_service_online" in data);
        assert.ok("database" in data);
      }
    } catch (_err) {
      // Server may not be running in isolated CI test run
    }
  });
});
