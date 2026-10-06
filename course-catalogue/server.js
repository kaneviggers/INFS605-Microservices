const express = require('express')
const app = express()

app.get('/health', (req, res) => {
    res.status(200).json()
})

app.get('/courses', (req, res) => {
    res.json({
        "WHAT": "IS UPPPPP"
    })
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`course-catalogue service listening on ${PORT}`));