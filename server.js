const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/user", require("./routes/users"));
app.use("/transactions", require("./routes/transactions"));
app.use("/shops", require("./routes/shops"));
app.use("/goals", require("./routes/goals"));
app.use("/parse-receipt", require("./routes/parse-receipt"));

app.get("/", (req, res) => res.send("Backend is running! Try /shops."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
