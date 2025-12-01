const express = require("express");
const testScript = require("./test-run");
const app = express();

const PORT =3000;

app.get("/", async(req, res) => {
    res.status(200).json({
        message: "test script is running"
    })
});


app.post("/run-test", async(req, res) =>{ 
    try{

        // const { api_url, access_token, company_id, refresh_token } = req.body;

        // if(!api_url || !access_token || !company_id || !refresh_token){
        //     return  res.status(400).json({
        //         message: "api_url, access_token, company_id and refresh_token are required in body"
        //     })
        // }

        // const result = await testScript.runTestSuite({
        //     apiUrl: api_url,
        //     accessToken: access_token,
        //     companyId: company_id,
        //     refreshToken: refresh_token,
        //     sessionId: session_id,
        // })
        const result = await testScript.runAllTests();

        res.status(200).json({
            message: "Test script executed successfully",
            data: result
        });

    }catch(error){
        console.log("error in running test" , error);
        throw error;
    }
})


app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});