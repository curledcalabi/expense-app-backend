fetch("http://localhost:3000/parse-receipt/confirm", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    merchantName: process.argv[2],
    shopId: Number(process.argv[3]),
  }),
})
  .then((r) => r.json())
  .then((d) => console.log(JSON.stringify(d, null, 2)))
  .catch((e) => console.error(e));
