<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") exit;

try {
    $conn = new mysqli("localhost", "root", "", "salescollection");
    if ($conn->connect_error) throw new Exception("Database connection failed: ".$conn->connect_error);
    $conn->set_charset("utf8mb4");

    $input = json_decode(file_get_contents("php://input"), true) ?: [];

    // Optional: send {"debug": true} to get the list of billed quotations
    // that make up "Total Billed Value" (to compare with Quotation Wise page).
    $debugMode = !empty($input["debug"]);

    $reportMode = strtolower(trim($input["report_mode"] ?? "month"));
    if (!in_array($reportMode, ["month","year","week"], true)) $reportMode = "month";

    $selectedYear = trim((string)($input["year"] ?? date("Y")));
    if (!preg_match('/^\d{4}$/', $selectedYear)) throw new Exception("Invalid year");

    $selectedMonth = trim((string)($input["month"] ?? date("m")));
    if (!preg_match('/^(0[1-9]|1[0-2])$/', $selectedMonth)) throw new Exception("Invalid month");

    $selectedWeek = trim((string)($input["week"] ?? "1"));
    if (!preg_match('/^[1-5]$/', $selectedWeek)) throw new Exception("Invalid week");

    /*
     * REPORT PERIOD
     * Week is a week-of-month period:
     *   Week 1 = days 01-07
     *   Week 2 = days 08-14
     *   Week 3 = days 15-21
     *   Week 4 = days 22-28
     *   Week 5 = days 29-end of month (only when those dates exist)
     */
    $month = $selectedYear."-".$selectedMonth;

    if ($reportMode === "week") {
        $monthStart = strtotime($month."-01");
        $daysInMonth = (int)date("t", $monthStart);
        $weekStartDay = (($selectedWeek - 1) * 7) + 1;

        if ($weekStartDay > $daysInMonth) {
            throw new Exception("Selected week does not exist in this month");
        }

        $weekEndDay = min($selectedWeek * 7, $daysInMonth);
        $start = sprintf("%s-%02d", $month, $weekStartDay);
        $end = sprintf("%s-%02d", $month, $weekEndDay);
        $periodLabel = "Week ".$selectedWeek." (".date("d M", strtotime($start))." - ".date("d M Y", strtotime($end)).")";
    } elseif ($reportMode === "month") {
        $start = $month."-01";
        $end = date("Y-m-t", strtotime($start));
        $periodLabel = date("F Y", strtotime($start));
    } else {
        $month = $selectedYear."-ALL";
        $start = $selectedYear."-01-01";
        $end = $selectedYear."-12-31";
        $periodLabel = $selectedYear;
    }

    function nrm($v){ return strtolower(trim(preg_replace('/\s+/', ' ', str_replace(["_","-"]," ",(string)$v)))); }

    /*
     * LONG-TERM CLIENTS (removed from coordinator effort)
     * ---------------------------------------------------
     * Put the party / ledger names here. Matching ignores upper/lower case,
     * extra spaces, "-" and "_".
     *   "ABC Traders"   -> exact match only
     *   "ABC*"          -> any party whose name CONTAINS "ABC"
     *
     * Quotations of these parties are taken out of every coordinator figure
     * (calls, followed, brought/assigned, coordinator sales, brought & billed,
     * lost, pending, conversion rate) and are reported separately.
     */
    $LONG_TERM_CLIENTS = [
        // "Example Long Term Client Pvt Ltd",
        // "Another Client*",
    ];

    function isLongTermClient($name, $list){
        $n = nrm($name);
        if($n==="") return "";
        foreach($list as $entry){
            $entry = trim((string)$entry);
            if($entry==="") continue;
            $wild = substr($entry,-1)==="*";
            $label = trim($wild ? substr($entry,0,-1) : $entry);
            $e = nrm($label);
            if($e==="") continue;
            if($wild ? (strpos($n,$e)!==false) : ($n===$e)) return $label;
        }
        return "";
    }

    /*
     * refKey() is used ONLY for matching invoices to quotations.
     * It is identical to quotation_wise.php: strtolower(trim()).
     * (nrm() turned "-" and "_" into spaces, which could match a
     *  different quotation than the Quotation Wise page.)
     */
    function refKey($v){ return strtolower(trim((string)$v)); }

    function day($v){
        if(!$v)return "";
        if(preg_match('/^(\d{4}-\d{2}-\d{2})/',trim((string)$v),$m))return $m[1];
        $t=strtotime((string)$v);
        return $t===false?"":date("Y-m-d",$t);
    }
    function mon($v){ $d=day($v); return $d?substr($d,0,7):""; }
    function person($r){
        foreach(["telecaller","followup_by","followup_person","followupPerson","user_name","username","name"] as $k)
            if(!empty($r[$k])) return trim((string)$r[$k]);
        return "Unknown";
    }

    /*
     * Coordinator attribution helper.
     *
     * A quotation can belong to a coordinator even when the coordinator
     * did not make the latest follow-up. We therefore check:
     *   1. Brought By
     *   2. Assigned To
     *   3. Follow-up coordinator
     *
     * Names are normalized so "Bincy CX", "Bincy", etc. can be matched
     * using the coordinator's base name.
     */
    function cleanCoordinatorName($v){
        $v = trim((string)$v);
        if($v === "") return "";
        $v = preg_replace('/\s+/', ' ', $v);
        return $v;
    }

    function coordinatorBaseName($v){
        $v = cleanCoordinatorName($v);
        if($v === "") return "";
        // Keep the first name/token. This makes "Bincy CX" -> "Bincy".
        return strtolower(trim(preg_split('/\s+/', $v)[0]));
    }

    function coordinatorMatches($stored, $coordinator){
        $a = coordinatorBaseName($stored);
        $b = coordinatorBaseName($coordinator);
        return $a !== "" && $b !== "" && $a === $b;
    }

    function peopleKey($name){
        $name = cleanCoordinatorName($name);
        if($name === "" || strcasecmp($name, "Unknown") === 0) return "";
        return coordinatorBaseName($name);
    }

    function findCoordinatorInRow($r){
        foreach([
            "brought_by","broughtby","brought_by_name","broughtBy",
            "assigned_to","assignedto","assigned_to_name","assignedTo",
            "sales_coordinator","salesCoordinator"
        ] as $k){
            if(isset($r[$k]) && trim((string)$r[$k]) !== ""){
                return cleanCoordinatorName($r[$k]);
            }
        }
        return "";
    }
    function callDay($r){
        foreach(["call_date","callDate","followup_date","followupDate","created_at"] as $k)
            if(!empty($r[$k])) return day($r[$k]);
        return "";
    }
    function lost($s){ return in_array(nrm($s),["lost","not interested","closed lost"],true); }
    function noCredit($s){ return in_array(nrm($s),["not interested","lost","closed lost","not reachable"],true); }
    function billedStatus($s){ return in_array(nrm($s),["billed","bill"],true); }

    /*
     * SALES ORDERS / QUOTATIONS
     * ORDER BY is the same as quotation_wise.php so that, when one Order No.
     * is shared by several quotations, the SAME quotation wins in both files.
     */
    $qres=$conn->query("SELECT `Sl No`,VoucherNumber,OrderNo,Date,PartyLedgerName,EveInvMailingName,Amount,EveItemGstRate,EveItemTaxAmt,
        brought_by,assigned_to FROM salesdata
        WHERE LOWER(TRIM(COALESCE(VoucherTypeName,'')))='sales order'
        AND (TRIM(COALESCE(VoucherNumber,''))<>'' OR TRIM(COALESCE(OrderNo,''))<>'')
        ORDER BY Date DESC, `Sl No` DESC");
    if(!$qres) throw new Exception($conn->error);

    $quotes=[]; $ref=[];
    while($r=$qres->fetch_assoc()){
        $voucher=trim((string)$r["VoucherNumber"]);
        $order=trim((string)$r["OrderNo"]);
        $id=$voucher!==""?$voucher:$order;
        if($id==="") continue;

        if(!isset($quotes[$id])) $quotes[$id]=[
            "quotation_no"=>$id,
            "order_no"=>$order,
            "date"=>day($r["Date"]),
            "party_name"=>trim((string)$r["PartyLedgerName"])?:trim((string)$r["EveInvMailingName"]),
            "brought_by"=>cleanCoordinatorName($r["brought_by"] ?? ""),
            "assigned_to"=>cleanCoordinatorName($r["assigned_to"] ?? ""),
            "quotation_amount"=>0,
            "quotation_amount_with_gst"=>0,
            "billed_amount"=>0,
            "billed_amount_with_gst"=>0,
            "invoice_dates"=>[],
            "invoice_numbers"=>[]
        ];

        // Fill a missing date from later item rows (same as quotation_wise.php).
        if($quotes[$id]["date"]==="" && day($r["Date"])!=="") $quotes[$id]["date"]=day($r["Date"]);

        $quotationAmount=(float)($r["Amount"]??0);
        $quotationGst=(float)($r["EveItemTaxAmt"]??0);
        $quotationGstRate=(float)($r["EveItemGstRate"]??0);
        if($quotationGst==0 && $quotationGstRate!=0 && $quotationAmount!=0){
            $quotationGst=$quotationAmount*$quotationGstRate/100;
        }
        $quotes[$id]["quotation_amount"]+=$quotationAmount;
        $quotes[$id]["quotation_amount_with_gst"]+=($quotationAmount+$quotationGst);

        /*
         * Reference map - identical rules to quotation_wise.php:
         *  - Voucher number always maps to its quotation.
         *  - Order No. maps only if nothing is mapped yet (first row wins).
         */
        if($voucher!=="") $ref[refKey($voucher)]=$id;
        if($order!=="" && !isset($ref[refKey($order)])) $ref[refKey($order)]=$id;
    }

    /* INVOICES */
    $ires=$conn->query("SELECT VoucherNumber,Date,Amount,EveItemGstRate,EveItemTaxAmt,EveInvVchOrderNos FROM salesdata
        WHERE LOWER(TRIM(COALESCE(VoucherTypeName,'')))<>'sales order'
        AND EveInvVchOrderNos IS NOT NULL
        AND TRIM(EveInvVchOrderNos)<>''");
    if(!$ires) throw new Exception($conn->error);

    while($r=$ires->fetch_assoc()){
        $reference=trim((string)$r["EveInvVchOrderNos"]);
        if($reference==="") continue;

        // Same reference parsing as quotation_wise.php.
        $refs=preg_split('/\s*[,;\r\n]+\s*/',$reference);
        $refs[]=$reference;
        $refs=array_values(array_unique(array_filter(array_map("trim",$refs))));

        foreach($refs as $x){
            $k=refKey($x);
            if($k===""||!isset($ref[$k])) continue;

            $id=$ref[$k];
            $inv=trim((string)$r["VoucherNumber"]);

            $invoiceAmount=(float)($r["Amount"]??0);
            $invoiceGst=(float)($r["EveItemTaxAmt"]??0);
            $invoiceGstRate=(float)($r["EveItemGstRate"]??0);
            if($invoiceGst==0 && $invoiceGstRate!=0 && $invoiceAmount!=0){
                $invoiceGst=$invoiceAmount*$invoiceGstRate/100;
            }

            $quotes[$id]["billed_amount"]+=$invoiceAmount;
            $quotes[$id]["billed_amount_with_gst"]+=($invoiceAmount+$invoiceGst);
            if($inv!==""&&!in_array($inv,$quotes[$id]["invoice_numbers"],true))
                $quotes[$id]["invoice_numbers"][]=$inv;

            $d=day($r["Date"]);
            if($d!=="") $quotes[$id]["invoice_dates"][]=$d;
        }
    }

    foreach($quotes as &$q){
        $q["quotation_amount"] = round((float)$q["quotation_amount"], 2);

        /*
         * Tally-style rounding, same as quotation_wise.php:
         * the with-GST totals are rounded to the nearest rupee PER QUOTATION,
         * so the sum of quotations matches the Quotation Wise page exactly.
         */
        $q["quotation_amount_with_gst"] = round((float)$q["quotation_amount_with_gst"], 0);
        $q["billed_amount"] = round((float)$q["billed_amount"], 2);
        $q["billed_amount_with_gst"] = round((float)$q["billed_amount_with_gst"], 0);

        sort($q["invoice_dates"]);
        $q["invoice_date"]=$q["invoice_dates"][0]??"";
        $q["invoice_no"]=implode(", ",$q["invoice_numbers"]);
        $q["is_billed"]=($q["invoice_no"]!==""||$q["billed_amount"]>0);
        $q["excluded_client"]=isLongTermClient($q["party_name"],$LONG_TERM_CLIENTS);
        unset($q["invoice_dates"],$q["invoice_numbers"]);
    }
    unset($q);

    /* FOLLOW-UP HISTORY */
    $fres=$conn->query("SELECT id,quotation_no,call_date,followup_date,telecaller,status,remarks,created_at
        FROM quotation_followups
        ORDER BY quotation_no,created_at,id");
    if(!$fres) throw new Exception($conn->error);

    $history=[];
    while($r=$fres->fetch_assoc()){
        $raw=trim((string)$r["quotation_no"]);
        if($raw==="") continue;

        $id=$ref[refKey($raw)]??$raw;
        $r["quotation_no"]=$id;
        $history[$id][]=$r;
    }

    foreach($history as &$rows){
        usort($rows,function($a,$b){
            $x=strtotime((callDay($a)?:($a["created_at"]??""))." 23:59:59")?:0;
            $y=strtotime((callDay($b)?:($b["created_at"]??""))." 23:59:59")?:0;
            return $x<=>$y ?: ((int)$a["id"]<=> (int)$b["id"]);
        });
    }
    unset($rows);

    /*
      CREDIT / INCENTIVE BUCKETS

      Every billed quotation is placed into exactly ONE monetary bucket:
        1. Coordinator Sales      = qualifying coordinator effort/conversion
        2. Brought & Billed       = coordinator brought it, but no qualifying
                                   coordinator effort happened before billing
        3. Without Coordinator Credit = no coordinator ownership/effort credit
        4. Total Billed           = sum of the three buckets

      Incentive Sales = Coordinator Sales only.
      This keeps "Brought & Billed" visible without automatically paying
      incentive on a quotation that had no qualifying effort.
    */
    $state=[];
    $withoutCreditDetails=[];
    $broughtAndBilledDetails=[];

    foreach($quotes as $id=>$q){
        $rows=$history[$id]??[];

        /* Long-term client: own bucket, never credited to any coordinator. */
        if(($q["excluded_client"]??"")!==""){
            $latestEx=$rows?end($rows):null;
            $latestStatusEx=trim((string)($latestEx["status"]??""));
            $state[$id]=[
                "final_state"=>$q["is_billed"]?"Billed":(lost($latestStatusEx)?"Lost":"Pending"),
                "latest_status"=>$latestStatusEx,
                "credit"=>"",
                "attribution"=>"Long-term Client",
                "bucket"=>"long_term_client",
                "reason"=>"Long-term client: ".$q["excluded_client"]
            ];
            continue;
        }

        $latest=$rows?end($rows):null;
        $latestStatus=trim((string)($latest["status"]??""));

        $final=$q["is_billed"]
            ? "Billed"
            : (lost($latestStatus)?"Lost":"Pending");

        $credit="";
        $attribution=$final;
        $bucket=$q["is_billed"] ? "without_coordinator_credit" : "";
        $reason="";

        if($q["is_billed"]){
            $before=[];

            foreach($rows as $row){
                $d=callDay($row);
                if(
                    $q["invoice_date"]==="" ||
                    ($d!=="" && $d<=$q["invoice_date"])
                ){
                    $before[]=$row;
                }
            }

            $broughtOwner=cleanCoordinatorName($q["brought_by"]??"");
            $assignedOwner=cleanCoordinatorName($q["assigned_to"]??"");

            /*
             * SALES OWNER PRIORITY
             * --------------------
             * If a quotation is assigned to a Sales Coordinator, that
             * coordinator owns the billed sale. Brought By is only used when
             * there is no Assigned To value. Follow-up person is the final
             * fallback.
             *
             * This also guarantees that one quotation produces only ONE
             * billed-sales credit even when the same person is Brought By,
             * Assigned To and Followed By.
             */
            $owner=$assignedOwner!=="" ? $assignedOwner : $broughtOwner;

            if(!$before){
                if($broughtOwner!==""){
                    $bucket="brought_and_billed";
                    $credit=$broughtOwner;
                    $attribution="Brought & Billed";
                    $reason="Brought by ".$broughtOwner." and billed without follow-up";
                }else{
                    $bucket="without_coordinator_credit";
                    $attribution="Billed Without Follow-up";
                    $reason="No follow-up before billing and no Brought By coordinator";
                }
            }else{
                $first=$before[0];
                $last=$before[count($before)-1];
                $firstStatus=trim((string)($first["status"]??""));
                $lastStatus=trim((string)($last["status"]??""));

                $noQualifyingEffort = billedStatus($firstStatus) || noCredit($lastStatus);

                /*
                 * An explicit Assigned To owner always receives the billed
                 * quotation. Follow-up qualification must not move that sale
                 * into Brought & Billed or Without Credit.
                 */
                if($assignedOwner!==""){
                    $credit=$assignedOwner;
                    $attribution="Coordinator Converted";
                    $bucket="coordinator_effort";
                    $reason=$noQualifyingEffort
                        ? "Assigned To ownership: ".$assignedOwner."; billed quotation credited to assigned coordinator"
                        : "Coordinator effort with Assigned To ownership: ".$assignedOwner;
                }elseif($noQualifyingEffort){
                    if($broughtOwner!==""){
                        $bucket="brought_and_billed";
                        $credit=$broughtOwner;
                        $attribution="Brought & Billed";
                        $reason=billedStatus($firstStatus)
                            ? "Brought by ".$broughtOwner."; first follow-up status was Billed"
                            : "Brought by ".$broughtOwner."; latest status before billing: ".$lastStatus;
                    }else{
                        $bucket="without_coordinator_credit";
                        $attribution="Billed Without Telecaller Effort";
                        $reason=billedStatus($firstStatus)
                            ? "First follow-up status was Billed"
                            : "Latest status before billing: ".$lastStatus;
                    }
                }else{
                    /*
                     * Qualifying effort exists. Brought By / Assigned To is
                     * the primary ownership credit. If neither exists,
                     * fall back to the eligible follow-up coordinator.
                     */
                    if($owner!==""){
                        $credit=$owner;
                        $attribution="Coordinator Converted";
                        $bucket="coordinator_effort";
                        $reason=$broughtOwner!==""
                            ? "Coordinator effort with Brought By ownership: ".$broughtOwner
                            : "Coordinator effort with Assigned To ownership: ".$assignedOwner;
                    }else{
                        $candidate=person($last);
                        if($candidate!=="" && $candidate!=="Unknown"){
                            $credit=$candidate;
                            $attribution="Coordinator Converted";
                            $bucket="coordinator_effort";
                            $reason="No owner recorded; eligible follow-up before billing";
                        }else{
                            $bucket="without_coordinator_credit";
                            $attribution="Billed Without Follow-up";
                            $reason="No coordinator ownership or identifiable follow-up";
                        }
                    }
                }
            }

            $detail=[
                "quotation_no"=>$id,
                "party_name"=>$q["party_name"],
                "invoice_date"=>$q["invoice_date"],
                "invoice_no"=>$q["invoice_no"],
                "billed_amount"=>$q["billed_amount_with_gst"],
                "attribution"=>$attribution,
                "bucket"=>$bucket,
                "brought_by"=>$q["brought_by"],
                "assigned_to"=>$q["assigned_to"],
                "credit"=>$credit,
                "reason"=>$reason
            ];

            if($bucket==="without_coordinator_credit") $withoutCreditDetails[]=$detail;
            if($bucket==="brought_and_billed") $broughtAndBilledDetails[]=$detail;
        }

        $state[$id]=[
            "final_state"=>$final,
            "latest_status"=>$latestStatus,
            "credit"=>$credit,
            "attribution"=>$attribution,
            "bucket"=>$bucket,
            "reason"=>$reason
        ];
    }

    /*
      REPORT PERIOD

      For UNBILLED quotations:
        every follow-up/call in the selected month counts.

      For BILLED quotations:
        only follow-ups/calls on or before invoice date count.
        Calls after billing are NOT counted as activity for that quotation.

      This prevents a quotation that was already billed from later
      changing the calling-status numbers.
    */
    $period=[];
    $periodExcluded=[];

    foreach($history as $id=>$rows){
        foreach($rows as $r){
            $d=callDay($r);
            if($d==="" || $d<$start || $d>$end) continue;
            if(!isset($quotes[$id])) continue;

            $q=$quotes[$id];

            /*
              BILLED QUOTATIONS ARE REPORTED BY QUOTATION DATE

              The Quotation Wise page applies the selected period to the
              quotation DATE (row.date), not the invoice DATE.

              Therefore a quotation dated in September remains part
              of September even if its invoice was raised in October.
              Likewise, an August quotation invoiced in September does
              not move into the September report.
            */
            if($q["is_billed"] && $q["invoice_date"]!==""){
                $quotationDate = $q["date"] ?? "";

                if($reportMode === "month" && substr($quotationDate,0,7) !== $month){
                    continue;
                }

                if($reportMode === "week" &&
                   ($quotationDate < $start || $quotationDate > $end)){
                    continue;
                }

                if($reportMode === "year" &&
                   substr($quotationDate, 0, 4) !== $selectedYear){
                    continue;
                }

                /*
                 * Attribution/activity still freezes at the invoice date.
                 * Calls after billing are not treated as pre-billing effort.
                 */
                if($d>$q["invoice_date"]){
                    continue;
                }
            }

            /* Long-term client calls are counted separately, not as coordinator effort. */
            if(($q["excluded_client"]??"")!==""){
                $periodExcluded[]=$r;
                continue;
            }

            $period[]=$r;
        }
    }

    /*
      QUOTATION OWNERSHIP / INCENTIVE WORKLOAD
      ------------------------------------------
      Brought and Assigned are counted separately.

      Responsibility is the UNIQUE quotation count for a coordinator
      where that coordinator is either Brought By OR Assigned To.
      A quotation brought by and assigned to the same person is counted once.
    */
    $ownership=[];

    foreach($quotes as $id=>$q){

        $qd=$q["date"]??"";

        if($qd==="" || $qd<$start || $qd>$end) continue;
        if(($q["excluded_client"]??"")!=="") continue;

        $broughtOwner=cleanCoordinatorName($q["brought_by"]??"");
        $assignedOwner=cleanCoordinatorName($q["assigned_to"]??"");

        $broughtKey=peopleKey($broughtOwner);
        $assignedKey=peopleKey($assignedOwner);

        if($broughtOwner!=="" && $broughtKey!==""){

            if(!isset($ownership[$broughtKey])){
                $ownership[$broughtKey]=[
                    "name"=>$broughtOwner,
                    "brought_ids"=>[],
                    "assigned_ids"=>[],
                    "responsible_ids"=>[]
                ];
            }

            $ownership[$broughtKey]["brought_ids"][$id]=true;
            $ownership[$broughtKey]["responsible_ids"][$id]=true;
        }

        if($assignedOwner!=="" && $assignedKey!==""){

            if(!isset($ownership[$assignedKey])){
                $ownership[$assignedKey]=[
                    "name"=>$assignedOwner,
                    "brought_ids"=>[],
                    "assigned_ids"=>[],
                    "responsible_ids"=>[]
                ];
            }

            $ownership[$assignedKey]["assigned_ids"][$id]=true;
            $ownership[$assignedKey]["responsible_ids"][$id]=true;
        }
    }


    $people=[];

    /*
      ACTIVE FOLLOW-UP PERSON RULE
      ----------------------------
      The report lists ONLY people who actually appear as a follow-up person.
      Brought By / Assigned To values do not create rows.

      A follow-up person is considered active if their latest follow-up
      activity is within 10 days of today.
    */
    $today=date("Y-m-d");
    $referenceDate=$today;
    $activeCutoff=date("Y-m-d",strtotime($referenceDate." -10 days"));

    $latestPersonActivity=[];

    foreach($history as $id=>$rows){
        foreach($rows as $r){
            $rawPerson=person($r);
            $key=peopleKey($rawPerson);
            $d=callDay($r);

            if($key==="" || $d==="") continue;

            if(
                !isset($latestPersonActivity[$key]) ||
                $d>$latestPersonActivity[$key]["date"]
            ){
                $latestPersonActivity[$key]=[
                    "date"=>$d,
                    "name"=>cleanCoordinatorName($rawPerson)
                ];
            }
        }
    }

    /* Only active follow-up persons can enter the report list. */
    foreach($period as $r){
        $rawPerson=person($r);
        $key=peopleKey($rawPerson);
        $id=$r["quotation_no"];

        if($key==="" || !isset($latestPersonActivity[$key])) continue;

        $latestDate=$latestPersonActivity[$key]["date"];

        /* Inactive for more than 10 days -> do not show in report. */
        if($latestDate < $activeCutoff) continue;

        $p=$latestPersonActivity[$key]["name"];

        if(!isset($people[$p])) $people[$p]=[
            "telecaller"=>$p,
            "brought_quotations"=>0,
            "assigned_quotations"=>0,
            "responsible_quotations"=>0,
            "calls"=>0,
            "unique_quotations"=>0,
            "billed_quotations"=>0,
            "billed_value"=>0,
            "coordinator_sales_quotations"=>0,
            "coordinator_sales_value"=>0,
            "brought_and_billed_quotations"=>0,
            "brought_and_billed_value"=>0,
            "lost_quotations"=>0,
            "pending_quotations"=>0,
            "quotation_value"=>0,
            "sales_origin"=>[],
            "billing_months"=>[],
            "conversions"=>[],
            "quotations"=>[]
        ];

        $people[$p]["calls"]++;

        if(!isset($quotes[$id])) continue;
        if(isset($people[$p]["quotations"][$id])) continue;

        $q=$quotes[$id];
        $s=$state[$id]??[
            "final_state"=>"Pending",
            "credit"=>"",
            "attribution"=>"Pending",
            "bucket"=>""
        ];

        $people[$p]["unique_quotations"]++;
        $people[$p]["quotation_value"]+=(float)$q["quotation_amount_with_gst"];

        /*
          Conversion credit is based on:
          Assigned To -> Brought By -> eligible follow-up.

          The credit is matched to the displayed follow-up person by
          coordinator base name, so Bincy and Bincy CX are grouped.
        */
        $isCredit=
            $s["final_state"]==="Billed" &&
            $s["bucket"]==="coordinator_effort" &&
            coordinatorMatches($s["credit"],$p);

        $isBroughtAndBilled=
            $s["final_state"]==="Billed" &&
            $s["bucket"]==="brought_and_billed" &&
            coordinatorMatches($s["credit"],$p);

        if($isCredit){
            $people[$p]["billed_quotations"]++;
            $people[$p]["billed_value"]+=(float)$q["billed_amount_with_gst"];
            $people[$p]["coordinator_sales_quotations"]++;
            $people[$p]["coordinator_sales_value"]+=(float)$q["billed_amount_with_gst"];

            $qm=mon($q["date"])?: "Unknown";
            $bm=mon($q["invoice_date"])?: "Unknown";

            if(!isset($people[$p]["sales_origin"][$qm]))
                $people[$p]["sales_origin"][$qm]=[
                    "month"=>$qm,"count"=>0,"value"=>0
                ];
            $people[$p]["sales_origin"][$qm]["count"]++;
            $people[$p]["sales_origin"][$qm]["value"]+=(float)$q["billed_amount_with_gst"];

            if(!isset($people[$p]["billing_months"][$bm]))
                $people[$p]["billing_months"][$bm]=[
                    "month"=>$bm,"count"=>0,"value"=>0
                ];
            $people[$p]["billing_months"][$bm]["count"]++;
            $people[$p]["billing_months"][$bm]["value"]+=(float)$q["billed_amount_with_gst"];

            $lastFollowup="";
            foreach(array_reverse($history[$id]??[]) as $h){
                $hd=callDay($h);

                if(
                    coordinatorMatches(person($h),$p) &&
                    ($q["invoice_date"]==="" || ($hd!=="" && $hd<=$q["invoice_date"]))
                ){
                    $lastFollowup=$hd;
                    break;
                }
            }

            $days=($q["date"]&&$q["invoice_date"])
                ? max(0,round((strtotime($q["invoice_date"])-strtotime($q["date"]))/86400))
                : null;

            $people[$p]["conversions"][]=[
                "quotation_no"=>$id,
                "party_name"=>$q["party_name"],
                "brought_by"=>$q["brought_by"],
                "assigned_to"=>$q["assigned_to"],
                "quotation_date"=>$q["date"],
                "last_followup_date"=>$lastFollowup,
                "invoice_date"=>$q["invoice_date"],
                "invoice_no"=>$q["invoice_no"],
                "quotation_month"=>$qm,
                "billing_month"=>$bm,
                "billed_amount"=>$q["billed_amount_with_gst"],
                "days_to_convert"=>$days
            ];
        }elseif($isBroughtAndBilled){
            $people[$p]["brought_and_billed_quotations"]++;
            $people[$p]["brought_and_billed_value"]+=(float)$q["billed_amount_with_gst"];
        }elseif($s["final_state"]==="Lost"){
            $people[$p]["lost_quotations"]++;
        }elseif($s["final_state"]!=="Billed"){
            $people[$p]["pending_quotations"]++;
        }

        $people[$p]["quotations"][$id]=true;
    }

    /*
     * A coordinator who brought a quotation and got it billed without any
     * qualifying follow-up must still appear in the report. This is kept
     * separate from Coordinator Sales / Incentive Sales.
     *
     * FIXED: the period is now decided by the QUOTATION date (same as the
     * summary, the detail tables and the Quotation Wise page), not by the
     * invoice date.
     */
    foreach($quotes as $id=>$q){
        $s=$state[$id]??[];
        if(($s["bucket"]??"")!=="brought_and_billed") continue;

        $quotationDate=$q["date"]??"";
        $include=false;
        if($quotationDate!==""){
            $include = $reportMode==="year"
                ? substr($quotationDate,0,4)===$selectedYear
                : ($quotationDate>=$start && $quotationDate<=$end);
        }
        if(!$include) continue;

        $owner=cleanCoordinatorName($q["brought_by"]??"");
        if($owner==="") continue;
        $key=peopleKey($owner);
        if($key==="") continue;

        $displayName=$owner;
        foreach(array_keys($people) as $existingName){
            if(peopleKey($existingName)===$key){ $displayName=$existingName; break; }
        }

        if(!isset($people[$displayName])) $people[$displayName]=[
            "telecaller"=>$displayName,
            "brought_quotations"=>0,
            "assigned_quotations"=>0,
            "responsible_quotations"=>0,
            "calls"=>0,
            "unique_quotations"=>0,
            "billed_quotations"=>0,
            "billed_value"=>0,
            "coordinator_sales_quotations"=>0,
            "coordinator_sales_value"=>0,
            "brought_and_billed_quotations"=>0,
            "brought_and_billed_value"=>0,
            "lost_quotations"=>0,
            "pending_quotations"=>0,
            "quotation_value"=>0,
            "sales_origin"=>[],
            "billing_months"=>[],
            "conversions"=>[],
            "quotations"=>[]
        ];

        if(isset($people[$displayName]["quotations"][$id])) continue;
        $people[$displayName]["brought_and_billed_quotations"]++;
        $people[$displayName]["brought_and_billed_value"]+=(float)$q["billed_amount_with_gst"];
        $people[$displayName]["billed_value"]+=(float)$q["billed_amount_with_gst"];
        $people[$displayName]["quotations"][$id]=true;
    }

    /* Merge ownership metrics by coordinator base name so names such as
       "Bincy" and "Bincy CX" are treated as the same owner. */
    $ownershipByKey=[];

    foreach($ownership as $okey=>$o){
        $broughtIds=array_keys($o["brought_ids"]??[]);
        $assignedIds=array_keys($o["assigned_ids"]??[]);

        /* Responsibility = UNION of Brought and Assigned quotation IDs. */
        $responsibleIds=array_values(
            array_unique(
                array_merge($broughtIds,$assignedIds),
                SORT_REGULAR
            )
        );

        $ownershipByKey[$okey]=[
            "brought"=>count($broughtIds),
            "assigned"=>count($assignedIds),
            "responsible"=>count($responsibleIds)
        ];
    }
    foreach($people as $name=>&$personRow){
        $okey=peopleKey($name);
        if(isset($ownershipByKey[$okey])){
            $personRow["brought_quotations"]=$ownershipByKey[$okey]["brought"];
            $personRow["assigned_quotations"]=$ownershipByKey[$okey]["assigned"];
            $personRow["responsible_quotations"]=$ownershipByKey[$okey]["responsible"];
        }
    }
    unset($personRow);

    /*
     * BILLED SALES MUST FOLLOW QUOTATION OWNERSHIP
     * ---------------------------------------------
     * A billed quotation belongs to the coordinator determined by the
     * attribution state (Assigned To -> Brought By -> eligible follow-up).
     *
     * This block only adds billed amounts to coordinators who are already
     * in the report's people list. It never creates new rows.
     */
    foreach($quotes as $id=>$q){
        if(!$q["is_billed"] || ($q["invoice_date"]??"")==="") continue;

        $quotationDate=$q["date"]??"";
        if($quotationDate==="") continue;

        $include=$reportMode==="year"
            ? substr($quotationDate,0,4)===$selectedYear
            : ($quotationDate>=$start && $quotationDate<=$end);

        if(!$include) continue;

        $s=$state[$id]??[];
        $bucket=$s["bucket"]??"without_coordinator_credit";
        $credit=cleanCoordinatorName($s["credit"]??"");

        if($bucket!=="coordinator_effort" && $bucket!=="brought_and_billed") continue;

        /* Brought & Billed ownership is always the Brought By coordinator. */
        if($bucket==="brought_and_billed"){
            $credit=cleanCoordinatorName($q["brought_by"]??"");
        }

        if($credit==="") continue;

        $creditKey=peopleKey($credit);
        if($creditKey==="") continue;

        /* Reuse the existing display name for Bincy / Bincy CX. */
        $displayName=$credit;
        foreach(array_keys($people) as $existingName){
            if(peopleKey($existingName)===$creditKey){
                $displayName=$existingName;
                break;
            }
        }

        if(!isset($people[$displayName])) continue;

        /* Never add the same quotation twice. */
        if(isset($people[$displayName]["quotations"][$id])) continue;

        $amount=(float)$q["billed_amount_with_gst"];

        $people[$displayName]["billed_quotations"]++;
        $people[$displayName]["billed_value"]+=$amount;
        $people[$displayName]["quotations"][$id]=true;

        if($bucket==="coordinator_effort"){
            $people[$displayName]["coordinator_sales_quotations"]++;
            $people[$displayName]["coordinator_sales_value"]+=$amount;
        }else{
            $people[$displayName]["brought_and_billed_quotations"]++;
            $people[$displayName]["brought_and_billed_value"]+=$amount;
        }
    }

    /*
     * Keep the normal activity-based coordinator list. Billed sales are not
     * allowed to create additional coordinator rows.
     */
    foreach($people as $name=>$row){
        $key=peopleKey($name);
        if(
            $key==="" ||
            (!isset($latestPersonActivity[$key]) ||
             $latestPersonActivity[$key]["date"] < $activeCutoff) ||
            (int)($row["calls"]??0) <= 0
        ){
            unset($people[$name]);
        }
    }

    foreach($people as &$p){

        /*
         * Success Percentage = Converted Quotations / Unique Quotations x 100
         */
        $p["success_percentage"]=$p["unique_quotations"] > 0
            ? round(
                ($p["billed_quotations"] / $p["unique_quotations"]) * 100,
                2
            )
            : 0;

        $p["sales_origin"]=array_values($p["sales_origin"]);
        $p["billing_months"]=array_values($p["billing_months"]);

        unset($p["quotations"]);
    }
    unset($p);

    $persons=array_values($people);
    usort($persons,function($a,$b){
        $x=$b["success_percentage"]<=>$a["success_percentage"];
        return $x?:($b["billed_value"]<=>$a["billed_value"]);
    });

    foreach($persons as $i=>&$p) $p["rank"]=$i+1;
    unset($p);

    $summary=[
        "total_calls"=>count($period),
        "unique_quotations"=>0,
        "total_brought_quotations"=>0,
        "total_assigned_quotations"=>0,
        "total_responsible_quotations"=>0,
        "billed_quotations"=>0,
        "billed_value"=>0,
        "total_billed_quotations"=>0,
        "total_billed_value"=>0,
        "coordinator_sales_value"=>0,
        "brought_and_billed_value"=>0,
        "without_coordinator_credit_value"=>0,
        "reconciliation_difference"=>0,
        "long_term_client_value"=>0,
        "long_term_client_quotations"=>0,
        "long_term_client_quotation_value"=>0,
        "long_term_client_billed_quotations"=>0,
        "long_term_client_calls"=>0,
        "notes_billed_count"=>0,
        "notes_billed_value"=>0,
        "notes_billed_no_invoice"=>0,
        "lost_quotations"=>0,
        "pending_quotations"=>0,
        "billed_without_followup"=>0,
        "billed_without_effort"=>0,
        "overall_success_percentage"=>0
    ];

    $periodQuotationIds=[];
    foreach($period as $r){
        if(!empty($r["quotation_no"])) $periodQuotationIds[$r["quotation_no"]]=true;
    }
    $summary["unique_quotations"]=count($periodQuotationIds);

    foreach($persons as $p){
        $summary["total_brought_quotations"] += (int)($p["brought_quotations"]??0);
        $summary["total_assigned_quotations"] += (int)($p["assigned_quotations"]??0);
        $summary["total_responsible_quotations"] += (int)($p["responsible_quotations"]??0);
        foreach(["billed_quotations","billed_value","lost_quotations","pending_quotations"] as $k)
            $summary[$k]+=$p[$k];
        $summary["coordinator_sales_value"] += (float)($p["coordinator_sales_value"]??0);
        $summary["brought_and_billed_value"] += (float)($p["brought_and_billed_value"]??0);
    }

    /* Bucket totals are calculated directly from billed quotations so inactive
       coordinators cannot make the overall totals disappear from the report. */
    $summary["coordinator_sales_value"] = 0;
    $summary["brought_and_billed_value"] = 0;

    $debugBilled=[];

    foreach($quotes as $id=>$q){
        if(!$q["is_billed"] || ($q["invoice_date"]??"")==="") continue;

        /*
         * MATCH THE QUOTATION WISE TOTAL:
         * Billed quotations are included according to the quotation date.
         * The invoice date is used only to freeze follow-up attribution.
         */
        $quotationDate = $q["date"] ?? "";
        $include=false;

        if($reportMode==="year"){
            $include=substr($quotationDate,0,4)===$selectedYear;
        }else{
            $include=($quotationDate>=$start && $quotationDate<=$end);
        }

        if(!$include) continue;

        $summary["total_billed_quotations"]++;
        $amount=(float)$q["billed_amount_with_gst"];
        $summary["total_billed_value"] += $amount;

        $bucket=$state[$id]["bucket"]??"without_coordinator_credit";

        if($bucket==="coordinator_effort") {
            $summary["coordinator_sales_value"] += $amount;
        } elseif($bucket==="brought_and_billed") {
            $summary["brought_and_billed_value"] += $amount;
        } elseif($bucket==="long_term_client") {
            $summary["long_term_client_value"] += $amount;
        }

        if($debugMode){
            $debugBilled[]=[
                "quotation_no"=>$id,
                "order_no"=>$q["order_no"],
                "quotation_date"=>$q["date"],
                "invoice_no"=>$q["invoice_no"],
                "invoice_date"=>$q["invoice_date"],
                "billed_amount_with_gst"=>$amount,
                "bucket"=>$bucket,
                "credit"=>$state[$id]["credit"]??""
            ];
        }
    }

    foreach($withoutCreditDetails as $x){
        $quotationNo = $x["quotation_no"] ?? "";
        $quotationDate = $quotes[$quotationNo]["date"] ?? "";

        $includeWithoutCredit = false;
        if($quotationDate !== ""){
            if($reportMode === "year"){
                $includeWithoutCredit = substr($quotationDate, 0, 4) === $selectedYear;
            } else {
                $includeWithoutCredit = ($quotationDate >= $start && $quotationDate <= $end);
            }
        }

        if(!$includeWithoutCredit) continue;

        if($x["attribution"]==="Billed Without Follow-up")
            $summary["billed_without_followup"]++;
        else
            $summary["billed_without_effort"]++;

        $summary["without_coordinator_credit_value"] += (float)($x["billed_amount"]??0);
    }

    /* Reconciliation: the three mutually-exclusive buckets must equal all billed value. */
    $bucketTotal = round(
        (float)$summary["coordinator_sales_value"] +
        (float)$summary["brought_and_billed_value"] +
        (float)$summary["without_coordinator_credit_value"] +
        (float)$summary["long_term_client_value"],
        2
    );
    $summary["reconciliation_difference"] = round(
        (float)$summary["total_billed_value"] - $bucketTotal,
        2
    );
    $summary["total_billed_value"] = round((float)$summary["total_billed_value"], 2);

    /* Return only detail rows belonging to the selected report period. */
    $withoutCreditPeriod=[];
    foreach($withoutCreditDetails as $x){
        $quotationNo = $x["quotation_no"] ?? "";
        $d = $quotes[$quotationNo]["date"] ?? "";
        if($d==="") continue;

        $include=$reportMode==="year"
            ? substr($d,0,4)===$selectedYear
            : ($d>=$start && $d<=$end);

        if($include) $withoutCreditPeriod[]=$x;
    }

    $broughtAndBilledPeriod=[];
    foreach($broughtAndBilledDetails as $x){
        $quotationNo = $x["quotation_no"] ?? "";
        $d = $quotes[$quotationNo]["date"] ?? "";
        if($d==="") continue;

        $include=$reportMode==="year"
            ? substr($d,0,4)===$selectedYear
            : ($d>=$start && $d<=$end);

        if($include) $broughtAndBilledPeriod[]=$x;
    }

    /*
     * LONG-TERM CLIENTS - separate tally
     * Period = quotation date (same rule as Quotation Wise page).
     */
    $callsByQuotation=[];
    foreach($periodExcluded as $r){
        $k=$r["quotation_no"]??"";
        if($k!=="") $callsByQuotation[$k]=($callsByQuotation[$k]??0)+1;
    }

    $longTermDetails=[];
    $longTermParties=[];

    foreach($quotes as $id=>$q){
        if(($q["excluded_client"]??"")==="") continue;
        $qd=$q["date"]??"";
        if($qd==="") continue;

        $inc=$reportMode==="year"
            ? substr($qd,0,4)===$selectedYear
            : ($qd>=$start && $qd<=$end);
        if(!$inc) continue;

        $label=$q["excluded_client"];
        $billedCounted=$q["is_billed"] && ($q["invoice_date"]??"")!=="";
        $qValue=(float)$q["quotation_amount_with_gst"];
        $bValue=$billedCounted ? (float)$q["billed_amount_with_gst"] : 0;
        $calls=$callsByQuotation[$id]??0;

        $longTermDetails[]=[
            "quotation_no"=>$id,
            "client"=>$label,
            "party_name"=>$q["party_name"],
            "quotation_date"=>$qd,
            "quotation_amount"=>$qValue,
            "status"=>$state[$id]["final_state"]??"Pending",
            "invoice_no"=>$billedCounted ? $q["invoice_no"] : "",
            "invoice_date"=>$billedCounted ? $q["invoice_date"] : "",
            "billed_amount"=>$bValue,
            "calls"=>$calls
        ];

        if(!isset($longTermParties[$label])) $longTermParties[$label]=[
            "client"=>$label,"quotations"=>0,"billed_quotations"=>0,
            "quotation_value"=>0,"billed_value"=>0,"calls"=>0
        ];
        $longTermParties[$label]["quotations"]++;
        $longTermParties[$label]["quotation_value"]+=$qValue;
        $longTermParties[$label]["calls"]+=$calls;
        if($billedCounted){
            $longTermParties[$label]["billed_quotations"]++;
            $longTermParties[$label]["billed_value"]+=$bValue;
        }

        $summary["long_term_client_quotations"]++;
        $summary["long_term_client_quotation_value"]+=$qValue;
        if($billedCounted) $summary["long_term_client_billed_quotations"]++;
    }

    usort($longTermDetails,function($a,$b){
        return strcmp((string)$a["client"],(string)$b["client"])
            ?: strcmp((string)$a["quotation_date"],(string)$b["quotation_date"]);
    });
    $longTermParties=array_values($longTermParties);
    usort($longTermParties,function($a,$b){ return $b["billed_value"]<=>$a["billed_value"]; });

    $summary["long_term_client_calls"]=count($periodExcluded);
    $summary["long_term_client_value"]=round((float)$summary["long_term_client_value"],2);
    $summary["long_term_client_quotation_value"]=round((float)$summary["long_term_client_quotation_value"],2);

    /*
     * QUOTATIONS MARKED "BILLED" IN FOLLOW-UP NOTES
     * Shows how each one is treated. Also lists quotations whose note says
     * Billed but for which no invoice was matched (a common cause of a
     * mismatch with the other system).
     */
    $notesBilled=[];

    foreach($quotes as $id=>$q){
        if(($q["excluded_client"]??"")!=="") continue;
        $qd=$q["date"]??"";
        if($qd==="") continue;

        $inc=$reportMode==="year"
            ? substr($qd,0,4)===$selectedYear
            : ($qd>=$start && $qd<=$end);
        if(!$inc) continue;

        $hit=null;
        foreach(($history[$id]??[]) as $h){
            if(!billedStatus($h["status"]??"")) continue;
            $hd=callDay($h);
            if($q["is_billed"] && ($q["invoice_date"]??"")!=="" && $hd!=="" && $hd>$q["invoice_date"]) continue;
            $hit=$h;
            break;
        }
        if(!$hit) continue;

        $hasInvoice=$q["is_billed"] && ($q["invoice_date"]??"")!=="";
        $bucket=$state[$id]["bucket"]??"";

        $notesBilled[]=[
            "quotation_no"=>$id,
            "party_name"=>$q["party_name"],
            "quotation_date"=>$qd,
            "noted_by"=>person($hit),
            "noted_on"=>callDay($hit),
            "has_invoice"=>$hasInvoice,
            "invoice_no"=>$hasInvoice ? $q["invoice_no"] : "",
            "invoice_date"=>$hasInvoice ? $q["invoice_date"] : "",
            "amount"=>$hasInvoice ? (float)$q["billed_amount_with_gst"] : (float)$q["quotation_amount_with_gst"],
            "bucket"=>$bucket,
            "credit"=>$state[$id]["credit"]??"",
            "reason"=>$hasInvoice ? ($state[$id]["reason"]??"") : "Marked Billed in notes but no invoice matched"
        ];

        $summary["notes_billed_count"]++;
        if($hasInvoice) $summary["notes_billed_value"]+=(float)$q["billed_amount_with_gst"];
        else $summary["notes_billed_no_invoice"]++;
    }
    $summary["notes_billed_value"]=round((float)$summary["notes_billed_value"],2);

    /*
     * Overall Success Percentage
     * Total Converted Quotations / Total Unique Quotations x 100
     */
    $summary["overall_success_percentage"]=$summary["unique_quotations"] > 0
        ? round(
            ($summary["billed_quotations"] / $summary["unique_quotations"]) * 100,
            2
        )
        : 0;

    $response=[
        "success"=>true,
        "month"=>$selectedMonth,
        "year"=>$selectedYear,
        "week"=>$selectedWeek,
        "report_mode"=>$reportMode,
        "period_label"=>$periodLabel,
        "period_start"=>$start,
        "period_end"=>$end,
        "month_start"=>$start,
        "month_end"=>$end,
        "summary"=>$summary,
        "persons"=>$persons,
        "without_credit_bills"=>$withoutCreditPeriod,
        "brought_and_billed"=>$broughtAndBilledPeriod,
        "long_term_clients"=>$longTermDetails,
        "long_term_party_summary"=>$longTermParties,
        "notes_billed"=>$notesBilled,
        "generated_at"=>date("Y-m-d H:i:s")
    ];

    if($debugMode){
        $response["debug_billed_quotations"]=$debugBilled;
    }

    echo json_encode($response,JSON_UNESCAPED_UNICODE);

    $conn->close();
}catch(Throwable $e){
    http_response_code(500);
    echo json_encode(["success"=>false,"message"=>$e->getMessage()]);
}
?>
