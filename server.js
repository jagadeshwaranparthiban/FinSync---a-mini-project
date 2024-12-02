import express from "express"
import pg from 'pg';
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import session from "express-session";
import crypto from "crypto";
import cron from "node-cron";


const app=express();
const port=3000;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(cors());
const db=new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "finance manager",
    password: "J@ga2107",
    port: 5432,
});

db.connect();

const secretKey = crypto.randomBytes(32).toString('hex');

app.use(session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
  }));

app.post("/login", async(req,res)=>{
    const { email, password }=req.body;
    console.log(email);
    console.log(password);
    try{
        const result=await db.query("select * from users where email=$1",[email]);
        console.log(result.rows);
        if(result.rows.length > 0){
            const hashedPassword=result.rows[0].password;
            const user=result.rows[0].email;
            console.log(user===email);
            bcrypt.compare(password,hashedPassword, (err,result)=>{
            if(result){
                //res.render("/home");
                console.log("logged in successfully");
                req.session.email=email;
                req.session.save((err) => {
                    if (err) console.error("Session save error:", err);
                    console.log(req.session.email) 
                });
                res.sendStatus(200);
            }else{
                res.send("Incorrect Login credentials. Try again");
                console.log(result);
            }
        });
        }else{
            res.send("User not found");
        }
    }catch(err){
        console.log(err);
    }
});

app.post("/create-account", async(req,res)=>{
    const {email, password}=req.body;
    try{
        const result=await db.query("select * from users where email=$1",[email]);
        if(result.rows.length > 0){
            res.send("Email already exists");
        }else{
            bcrypt.hash(password,10,(err,hashedPassword)=>{
                if(err){
                    console.log(err);
                }else{
                    db.query("insert into users(email,password) values($1,$2)",[email,hashedPassword]);
                    // res.render("/home");
                    console.log("account created");
                    res.redirect("/login");
                    res.sendStatus(200);
                }
            });
        }
    }catch(err){
        console.log(err);
    } 
    req.session.email=email;
});

function isAuthenticated(req,res,next){
    if(req.session.email && req.session){
        console.log("user authenticated");
        next();
    }else{
        res.send("You are not authenticated");
    }
}

app.post("/submit", isAuthenticated, async(req,res)=>{
    const {userName, phoneNo, dateOfBirth, Gender,accountType}=req.body;
    try{
        const loggedEmail=req.session.email;
        console.log(loggedEmail);
        const roi=Math.floor(Math.random()*5);
        const accountID="ACC-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        console.log(accountID);
        await db.query("insert into profile(email,user_name,gender,dob,contact,accountid,acc_type) values($1,$2,$3,$4,$5,$6,$7)",
            [loggedEmail,userName,Gender,dateOfBirth,phoneNo,accountID,accountType]);
        console.log("profile created");
        await db.query("insert into account(email,accountid,user_name,acc_type) values($1,$2,$3,$4)",
            [loggedEmail,accountID,userName,accountType]);
        console.log("account details recorded")
        if(accountType==="current"){
            await db.query("insert into current_account(accountid,acc_type,acc_balance,create_date,last_updated,intrest_rate) values($1,$2,$3,$4,$5,$6)",
                [accountID,accountType,0.000,new Date(),new Date(),roi]);
        }else if(accountType==="savings"){
            await db.query("insert into savings_account(accountid,acc_type,acc_balance,create_date,last_updated,intrest_rate) values($1,$2,$3,$4,$5,$6)",
                [accountID,accountType,0.000,new Date(),new Date(),roi]);
        }
        console.log(`${accountType} account initialized successfully`);
        res.status(200).send(`your account id is ${accountID}. Keep it secret`);
    }catch(err){
        console.log(err);
    }
});

const updateBalance=async ()=>{
    try{
        const result1=await db.query("select accountid, acc_balance, intrest_rate from current_account");
        const result2=await db.query("select accountid, acc_balance, intrest_rate from savings_account");
        for(let row of result1.rows){
            const {accountID, balance, rate}=row;
            const intrest=balance*rate/100;
            const newBalance=balance+intrest;
            await db.query("update current_account set acc_balance=$1 where accountid=$2",[newBalance, accountID]);
            await db.query("update current_account set last_updated=$1 where accountid=$2",[new Date(), accountID]);
        }
        for(let row of result2.rows){
            const {accountID, balance, rate}=row;
            const intrest=balance*rate/100;
            const newBalance=balance+intrest;
            await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newBalance, accountID]);
            await db.query("update savings_account set last_updated=$1 where accountid=$2",[new Date(), accountID]);
        }
    }catch(err){
        console.log(err);
    }
}

cron.schedule('0 0 1 * *', updateBalance);


app.put("/transfer", isAuthenticated, async(req,res)=>{
    const {amount, recieverUserName}=req.body;
    console.log(recieverUserName);
    try{
        const response=await db.query("select accountid from profile where user_name=$1",[recieverUserName]);
        if(response.rows.length==0){
            res.send("user does not exist");
        }else{
            const loggedEmail=req.session.email;
            const loggedResponse=await db.query("select accountid from account where email=$1",[loggedEmail])
            const senderAccountID=loggedResponse.rows[0].accountid;
            const recieverAccountID=response.rows[0].accountid;
            // 
            console.log(senderAccountID);
            console.log(recieverAccountID);
            const sender_acc_type_result=await db.query("select acc_type from account where accountid=$1",[senderAccountID]);
            const sender_acc_type=sender_acc_type_result.rows[0].acc_type;
            console.log(sender_acc_type);
            let senderBalanceResponse;
            let recieverBalanceResponse;
            if(sender_acc_type==="current"){
                senderBalanceResponse=await db.query("select acc_balance from current_account where accountid=$1",[senderAccountID]);
            }else{
                senderBalanceResponse=await db.query("select acc_balance from savings_account where accountid=$1",[senderAccountID]);
            }
            //console.log(senderBalanceResponse.rows[0].acc_balance);
            const reciever_acc_type_result=await db.query("select acc_type from account where accountid=$1",[recieverAccountID]);
            const reciever_acc_type=reciever_acc_type_result.rows[0].acc_type;
            console.log(reciever_acc_type);
            if(reciever_acc_type_result.rows[0].acc_type==="current"){
                recieverBalanceResponse=await db.query("select acc_balance from current_account where accountid=$1",[recieverAccountID]);
            }else{
                recieverBalanceResponse=await db.query("select acc_balance from savings_account where accountid=$1",[recieverAccountID]);
            }
            //console.log(recieverBalanceResponse.log[0].acc_balance);

            const senderBalance=parseFloat(senderBalanceResponse.rows[0].acc_balance);
            const recieverBalance=parseFloat(recieverBalanceResponse.rows[0].acc_balance);
            if(amount.toFixed(3) > senderBalance){
                console.log("not enough balance available");
            }else{
                //const lastTransactionDate=await db.query("select CURRENT_DATE - (select transaction_date from transactions where user_account=$1 order by transaction_date desc limit=1) as days_since_last_transaction",[senderAccountID]);
                if(sender_acc_type==="current"){
                    const transactionsPerDay=await db.query("select count(*) as per_day_transactions from transactions where user_account=$1 and DATE(transaction_date)=CURRENT_DATE",[senderAccountID])
                    if(transactionsPerDay.rows[0].per_day_transactions>10){
                        console.log("You have exceeded transaction limit. Try again after 24 hrs");
                    }else{
                        const transactionID="T#"+crypto.randomBytes(4).toString("hex").toUpperCase();
                        console.log(transactionID);
                        const newSenderBalance=(senderBalance-amount).toFixed(3);
                        const newRecieverBalance=(recieverBalance+amount).toFixed(3);
                        await db.query("update current_account set acc_balance=$1 where accountid=$2",[newSenderBalance,senderAccountID]);
                        if(reciever_acc_type==="current"){
                            await db.query("update current_account set acc_balance=$1 where accountid=$2",[newRecieverBalance,recieverAccountID]);
                        }else{
                            await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newRecieverBalance,recieverAccountID]);
                        }
                        await db.query("insert into transactions(transaction_id,user_account,counterparty_account,transaction_amount,transaction_date,transaction_type,status) values($1,$2,$3,$4,$5,$6,$7)",
                            [transactionID,senderAccountID,recieverAccountID,amount,new Date(),"transfer","completed"]
                        );
                        console.log("transaction successfull");
                    }
                }
                else if(sender_acc_type==="savings"){
                    const transactionID="T#"+crypto.randomBytes(4).toString("hex").toUpperCase();
                    console.log(transactionID);
                    await db.query("insert into transactions(transaction_id,user_account,counterparty_account,transaction_amount,transaction_date,transaction_type,status) values($1,$2,$3,$4,$5,$6,$7)",
                        [transactionID,senderAccountID,recieverAccountID,amount,new Date(),"transfer","completed"]
                    );
                    const newSenderBalance=(senderBalance-amount).toFixed(3);
                    const newRecieverBalance=(recieverBalance+amount).toFixed(3);
                    await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newSenderBalance,senderAccountID]);
                    if(reciever_acc_type==="current"){
                        await db.query("update current_account set acc_balance=$1 where accountid=$2",[newRecieverBalance,recieverAccountID]);
                    }else{
                        await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newRecieverBalance,recieverAccountID]);
                    }
                    console.log("transaction successfull");
                }
            }
        }
    }catch(err){
        console.log(err.stack);
    }
})

app.put("/deposit", isAuthenticated, async(req,res)=>{
    const {amount}=req.body;
    try{
        const loggedEmail=req.session.email;
        const accountID=await db.query("select accountid from account where email=$1",[loggedEmail]);
        const AccountID=accountID.rows[0].accountid;
        console.log(accountID.rows[0].accountid);
        const transactionID="T#"+crypto.randomBytes(4).toString("hex").toUpperCase();
        console.log(transactionID);
        const accountType=await db.query("select acc_type from account where accountid=$1",[AccountID]);
        console.log(accountType.rows[0].acc_type);
        if(accountType.rows[0].acc_type==="savings"){
                const response=await db.query("select acc_balance from savings_account where accountid=$1",[AccountID]);
                let balance=parseFloat(response.rows[0].acc_balance);
                const newBalance=(balance+parseFloat(amount)).toFixed(3);
                console.log(newBalance);
                await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newBalance, AccountID]);
                await db.query("insert into transactions(transaction_id,user_account,transaction_amount,transaction_type,transaction_date,status) values($1,$2,$3,$4,$5,$6)",
                [transactionID,AccountID,amount,"deposit",new Date(),"completed"]
                );
                console.log("amount deposited successfully");
            
        }else if(accountType.rows[0].acc_type==="current"){
            try{
                const transactionsPerDay=await db.query("select count(*) as per_day_transactions from transactions where user_account=$1 and DATE(transaction_date)=CURRENT_DATE",[AccountID])
                if(transactionsPerDay.rows[0].per_day_transactions>10){
                    console.log("You have exceeded transaction limit. Try again after 24 hrs");
                }else{
                    const response=await db.query("select acc_balance from current_account where accountid=$1",[AccountID]);
                    let balance=parseFloat(response.rows[0].acc_balance);
                    const newBalance=(balance+parseFloat(amount)).toFixed(3)
                    console.log(newBalance);
                    await db.query("update current_account set acc_balance=$1 where accountid=$2",[newBalance+amount, AccountID]);
                    await db.query("insert into transactions(transaction_id,user_account,transaction_amount,transaction_type,transaction_date,status) values($1,$2,$3,$4,$5,$6)",
                        [transactionID,AccountID,amount,"deposit",new Date(),"completed"]
                    )
                    console.log("amount deposited successfully");
                }
            }catch(err){
                console.log(err.stack);
            }
            
        }
    }catch(err){
        console.log(err.stack)
    }
});

app.put("/withdraw", isAuthenticated, async(req,res)=>{
    const {amount}=req.body;
    try{
        const loggedEmail=req.session.email;
        const accountID=await db.query("select accountid from account where email=$1",[loggedEmail]);
        const AccountID=accountID.rows[0].accountid;
        console.log(AccountID);
        const accountType=await db.query("select acc_type from account where accountid=$1",[AccountID]);
        if(accountType.rows[0].acc_type=="savings"){
            const response=await db.query("select acc_balance from savings_account where accountid=$1",[AccountID]);
            let balance=parseFloat(response.rows[0].acc_balance)
            if(amount.toFixed(3) > balance){
                console.log("insufficient balance");
            }else{
                const transactionID="T#"+crypto.randomBytes(4).toString("hex").toUpperCase();
                console.log(transactionID);
                const newBalance=(balance-amount).toFixed(3);
                console.log(newBalance);
                await db.query("update savings_account set acc_balance=$1 where accountid=$2",[newBalance,AccountID]);
                await db.query("insert into transactions(transaction_id,user_account,transaction_amount,transaction_type,transaction_date,status) values($1,$2,$3,$4,$5,$6)"
                    ,[transactionID,AccountID,amount,"withdrawal",new Date(),"completed"]);
                console.log("amount withdrawn successfully");
            }
        }else if(accountType.rows[0].acc_type==="current"){
            try{
                const transactionsPerDay=await db.query("select count(*) as per_day_transactions from transactions where user_account=$1 and DATE(transaction_date)=CURRENT_DATE",[AccountID])
                console.log(transactionsPerDay.rows[0].per_day_transactions)
                if(transactionsPerDay.rows[0].per_day_transactions>10){
                    console.log("You have exceeded transaction limit. Try again after 24 hrs");
                }else{
                    const response=await db.query("select acc_balance from current_account where accountid=$1",[AccountID]);
                    let balance=parseFloat(response.rows[0].acc_balance);
                    if(amount > balance){
                        console.log("insufficient balance");
                    }else{
                        const transactionID="T#"+crypto.randomBytes(4).toString("hex").toUpperCase();
                        console.log(transactionID);
                        const newBalance=(balance-amount).toFixed(3);
                        console.log(newBalance);
                        await db.query("update current_account set acc_balance=$1 where accountid=$2",[newBalance,AccountID]);
                        await db.query("insert into transactions(transaction_id,user_account,transaction_amount,transaction_type,transaction_date,status) values($1,$2,$3,$4,$5,$6)"
                        ,[transactionID,AccountID,amount,"withdrawal",new Date(),"completed"]);
                        console.log("amount withdrawn successfully");
                    }
                }
            }catch(err){
                console.log(err.stack);
            }
        }
    }catch(err){
        console.log(err);
    }
})
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });