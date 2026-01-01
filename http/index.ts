import express from "express";

const app = express();
const PORT = 5000;


app.get("/", (req,res) => {
   console.log("dinesh");
   res.send({
      message  : "this is / endpoint",
   })
})

app.listen(PORT, ()=>{
    console.log(`the app is running at the ${PORT}`)
})