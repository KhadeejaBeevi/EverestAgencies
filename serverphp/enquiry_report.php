<?php

require_once __DIR__ . '/api_auth.php';







/* =========================================================



   ENQUIRY REPORT API







   GET  = Get enquiries



   POST = Add OR Update enquiry



========================================================= */











/* =========================================================



   CORS



========================================================= */







header("Access-Control-Allow-Origin: *");



header("Access-Control-Allow-Methods: GET, POST, OPTIONS");



header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");



header("Content-Type: application/json; charset=UTF-8");











/* =========================================================



   PREFLIGHT



========================================================= */







if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {







    http_response_code(200);







    exit;







}











/* =========================================================



   DATABASE



========================================================= */







$host = "localhost";



$dbname = "salescollection";



$username = "root";



$password = "";











try {







    $pdo =



        new PDO(



            "mysql:host=$host;dbname=$dbname;charset=utf8mb4",



            $username,



            $password,



            [



                PDO::ATTR_ERRMODE =>



                    PDO::ERRMODE_EXCEPTION,







                PDO::ATTR_DEFAULT_FETCH_MODE =>



                    PDO::FETCH_ASSOC,







                PDO::ATTR_EMULATE_PREPARES =>



                    false



            ]



        );







} catch (PDOException $e) {







    http_response_code(500);







    echo json_encode([



        "success" => false,



        "message" => "Database connection failed.",



        "error" => $e->getMessage()



    ]);







    exit;







}











/* =========================================================



   RESPONSE



========================================================= */







function responseJson(



    $success,



    $message = "",



    $data = null,



    $extra = []



) {







    $response = [







        "success" => $success,







        "message" => $message







    ];











    if ($data !== null) {







        $response["data"] = $data;







    }











    if (!empty($extra)) {







        $response =



            array_merge(



                $response,



                $extra



            );







    }











    echo json_encode(



        $response,



        JSON_UNESCAPED_UNICODE |



        JSON_UNESCAPED_SLASHES



    );







    exit;







}











/* =========================================================



   FINANCIAL YEAR



========================================================= */







function getFinancialYear()



{







    $month =



        (int)date("n");







    $year =



        (int)date("Y");











    if ($month >= 4) {







        $startYear = $year;



        $endYear = $year + 1;







    } else {







        $startYear = $year - 1;



        $endYear = $year;







    }











    return sprintf(



        "%02d-%02d",



        $startYear % 100,



        $endYear % 100



    );







}











/* =========================================================



   NEXT ENQUIRY NUMBER



========================================================= */







function getNextEnquiryNumber($pdo)



{







    $financialYear =



        getFinancialYear();











    $pattern =



        "ENQ/%/" .



        $financialYear;











    $sql = "



        SELECT enquiry_no



        FROM enquiry_report



        WHERE enquiry_no LIKE :pattern



    ";











    $stmt =



        $pdo->prepare(



            $sql



        );











    $stmt->execute([



        ":pattern" =>



            $pattern



    ]);











    $rows =



        $stmt->fetchAll();











    $maxNumber =



        0;











    foreach ($rows as $row) {







        if (



            empty(



                $row["enquiry_no"]



            )



        ) {







            continue;







        }











        $parts =



            explode(



                "/",



                $row["enquiry_no"]



            );











        if (



            count($parts) >= 3 &&



            is_numeric($parts[1])



        ) {







            $number =



                (int)$parts[1];











            if (



                $number >



                $maxNumber



            ) {







                $maxNumber =



                    $number;







            }







        }







    }











    return



        "ENQ/" .



        ($maxNumber + 1) .



        "/" .



        $financialYear;







}











/* =========================================================



   BASE URL



========================================================= */







function getBaseUrl()



{







    $https =



        (!empty($_SERVER["HTTPS"]) &&



        $_SERVER["HTTPS"] !== "off");











    $protocol =



        $https



            ? "https"



            : "http";











    $host =



        $_SERVER["HTTP_HOST"] ??



        "localhost";











    return



        $protocol .



        "://" .



        $host .



        "/everest/serverphp";







}











/* =========================================================



   ATTACHMENT DIRECTORY



========================================================= */







function getUploadDirectory()



{







    return



        __DIR__ .



        DIRECTORY_SEPARATOR .



        "enquiry_uploads";







}











/* =========================================================



   CREATE UPLOAD DIRECTORY



========================================================= */







function ensureUploadDirectory()



{







    $directory =



        getUploadDirectory();











    if (



        !is_dir($directory)



    ) {







        if (



            !mkdir(



                $directory,



                0755,



                true



            )



        ) {







            throw new Exception(



                "Unable to create attachment directory."



            );







        }







    }











    return $directory;







}











/* =========================================================



   SAFE FILE NAME



========================================================= */







function safeFileName($name)



{







    $name =



        basename($name);











    return preg_replace(



        '/[^A-Za-z0-9._-]/',



        '_',



        $name



    );







}











/* =========================================================



   UPLOAD FILES



========================================================= */







function uploadAttachments(



    $enquiryNo



)



{







    if (



        empty($_FILES["attachments"])



    ) {







        return [];







    }











    ensureUploadDirectory();











    $files =



        $_FILES["attachments"];











    $uploaded =



        [];











    $maxSize =



        25 * 1024 * 1024;











    $count =



        is_array($files["name"])



            ? count($files["name"])



            : 0;











    for (



        $i = 0;



        $i < $count;



        $i++



    ) {







        $originalName =



            $files["name"][$i];











        $tmpName =



            $files["tmp_name"][$i];











        $error =



            $files["error"][$i];











        $size =



            (int)$files["size"][$i];











        if (



            $error === UPLOAD_ERR_NO_FILE



        ) {







            continue;







        }











        if (



            $error !== UPLOAD_ERR_OK



        ) {







            throw new Exception(



                "Upload failed for file: " .



                $originalName



            );







        }











        if (



            $size <= 0



        ) {







            continue;







        }











        if (



            $size > $maxSize



        ) {







            throw new Exception(



                "File '" .



                $originalName .



                "' is larger than 25 MB."



            );







        }











        $fileType =



            "";











        if (



            function_exists("finfo_open")



        ) {







            $finfo =



                finfo_open(



                    FILEINFO_MIME_TYPE



                );











            if ($finfo) {







                $fileType =



                    finfo_file(



                        $finfo,



                        $tmpName



                    );











                finfo_close(



                    $finfo



                );







            }







        }











        if (



            !$fileType



        ) {







            $fileType =



                $files["type"][$i] ??



                "application/octet-stream";







        }











        $extension =



            strtolower(



                pathinfo(



                    $originalName,



                    PATHINFO_EXTENSION



                )



            );











        $safeEnquiry =



            preg_replace(



                '/[^A-Za-z0-9_-]/',



                '_',



                $enquiryNo



            );











        $uniqueName =



            $safeEnquiry .



            "_" .



            bin2hex(



                random_bytes(8)



            );











        if ($extension) {







            $uniqueName .=



                "." .



                $extension;







        }











        $destination =



            getUploadDirectory() .



            DIRECTORY_SEPARATOR .



            $uniqueName;











        if (



            !move_uploaded_file(



                $tmpName,



                $destination



            )



        ) {







            throw new Exception(



                "Unable to save uploaded file: " .



                $originalName



            );







        }











        $fileUrl =



            getBaseUrl() .



            "/enquiry_uploads/" .



            rawurlencode(



                $uniqueName



            );











        $uploaded[] = [







            "id" =>



                bin2hex(



                    random_bytes(6)



                ),







            "original_name" =>



                $originalName,







            "stored_name" =>



                $uniqueName,







            "file_url" =>



                $fileUrl,







            "file_type" =>



                $fileType,







            "file_size" =>



                $size,







            "uploaded_at" =>



                date(



                    "Y-m-d H:i:s"



                )







        ];







    }











    return $uploaded;







}











/* =========================================================



   DELETE PHYSICAL FILE



========================================================= */







function deleteAttachmentFile(



    $attachment



)



{







    if (



        empty(



            $attachment["stored_name"]



        )



    ) {







        return;







    }











    $file =



        getUploadDirectory() .



        DIRECTORY_SEPARATOR .



        basename(



            $attachment["stored_name"]



        );











    if (



        is_file($file)



    ) {







        @unlink($file);







    }







}











/* =========================================================



   PARSE ATTACHMENTS



========================================================= */







function parseAttachments(



    $value



)



{







    if (



        empty($value)



    ) {







        return [];







    }











    if (



        is_array($value)



    ) {







        return $value;







    }











    $decoded =



        json_decode(



            $value,



            true



        );











    if (



        is_array($decoded)



    ) {







        return $decoded;







    }











    return [];







}











/* =========================================================



   ENTERED BY FROM SALESDATA



   Matches enquiry quotation number with salesdata quotation number



========================================================= */







function getQuotationDetailsByEnquiryNo($pdo, $enquiryNo)
{
    $enquiryNo = trim((string)$enquiryNo);
    $result = [
        "quotation_no" => "",
        "quotation_nos" => [],
        "entered_by" => ""
    ];

    if ($enquiryNo === "") return $result;

    try {
        $sql = "
            SELECT VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
            FROM salesdata
            WHERE TRIM(COALESCE(enquiry_no, '')) = :enquiry_no
            ORDER BY `Sl No` ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([":enquiry_no" => $enquiryNo]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!$rows) {
            $sql = "
                SELECT VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
                FROM salesdata
                WHERE LOWER(TRIM(COALESCE(enquiry_no, ''))) = LOWER(:enquiry_no)
                ORDER BY `Sl No` ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([":enquiry_no" => $enquiryNo]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($rows as $row) {
            foreach (["VoucherNumber", "OrderNo", "EveInvVchOrderNos"] as $field) {
                $q = trim((string)($row[$field] ?? ""));
                if ($q !== "" && !in_array($q, $result["quotation_nos"], true)) {
                    $result["quotation_nos"][] = $q;
                }
            }
            if ($result["entered_by"] === "") {
                $enteredBy = trim((string)($row["EnteredBy"] ?? ""));
                if ($enteredBy !== "") $result["entered_by"] = $enteredBy;
            }
        }

        if (!empty($result["quotation_nos"])) {
            $result["quotation_no"] = $result["quotation_nos"][0];
        }
        return $result;
    } catch (Throwable $e) {
        error_log("SALESDATA ENQUIRY LOOKUP ERROR: " . $e->getMessage());
        return $result;
    }
}












/* =========================================================



   TALLY QUOTATION -> ENQUIRY / ENTERED BY LOOKUP



   Used when quotation number is entered manually in the UI.



========================================================= */







function getEnquiryDetailsByQuotationNo($pdo, $quotationNo)
{
    $quotationNo = trim((string)$quotationNo);
    $result = [
        "enquiry_no" => "",
        "quotation_no" => "",
        "quotation_nos" => [],
        "entered_by" => ""
    ];

    if ($quotationNo === "") return $result;

    try {
        /* Use different placeholders because native PDO prepares do not safely
           support reusing the same named placeholder multiple times. */
        $sql = "
            SELECT enquiry_no, VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
            FROM salesdata
            WHERE TRIM(COALESCE(VoucherNumber, '')) = :voucher_no
               OR TRIM(COALESCE(OrderNo, '')) = :order_no
               OR TRIM(COALESCE(EveInvVchOrderNos, '')) = :eve_order_no
            ORDER BY `Sl No` ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ":voucher_no" => $quotationNo,
            ":order_no" => $quotationNo,
            ":eve_order_no" => $quotationNo
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!$rows) {
            $sql = "
                SELECT enquiry_no, VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
                FROM salesdata
                WHERE LOWER(TRIM(COALESCE(VoucherNumber, ''))) = LOWER(:voucher_no)
                   OR LOWER(TRIM(COALESCE(OrderNo, ''))) = LOWER(:order_no)
                   OR LOWER(TRIM(COALESCE(EveInvVchOrderNos, ''))) = LOWER(:eve_order_no)
                ORDER BY `Sl No` ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ":voucher_no" => $quotationNo,
                ":order_no" => $quotationNo,
                ":eve_order_no" => $quotationNo
            ]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($rows as $row) {
            if ($result["enquiry_no"] === "") {
                $enq = trim((string)($row["enquiry_no"] ?? ""));
                if ($enq !== "") $result["enquiry_no"] = $enq;
            }

            if ($result["entered_by"] === "") {
                $enteredBy = trim((string)($row["EnteredBy"] ?? ""));
                if ($enteredBy !== "") $result["entered_by"] = $enteredBy;
            }

            foreach (["VoucherNumber", "OrderNo", "EveInvVchOrderNos"] as $field) {
                $q = trim((string)($row[$field] ?? ""));
                if ($q !== "" && !in_array($q, $result["quotation_nos"], true)) {
                    $result["quotation_nos"][] = $q;
                }
                if ($result["quotation_no"] === "" && $q !== "") {
                    $result["quotation_no"] = $q;
                }
            }

            if ($result["enquiry_no"] !== "" && $result["entered_by"] !== "" && $result["quotation_no"] !== "") break;
        }

        if ($result["quotation_no"] === "" && $quotationNo !== "") {
            $result["quotation_no"] = $quotationNo;
        }
        return $result;
    } catch (Throwable $e) {
        error_log("SALESDATA QUOTATION LOOKUP ERROR: " . $e->getMessage());
        return $result;
    }
}












function attachQuotationEnteredBy($pdo, &$data)
{
    if (!is_array($data)) return;

    foreach ($data as &$row) {
        $savedQuotationNo = trim((string)($row["sales_order_no"] ?? ""));
        $savedEnquiryNo = trim((string)($row["enquiry_no"] ?? ""));

        $details = [
            "enquiry_no" => "",
            "quotation_no" => "",
            "quotation_nos" => [],
            "entered_by" => ""
        ];

        /* Direction 1: Enquiry page has quotation number. */
        if ($savedQuotationNo !== "") {
            $details = getEnquiryDetailsByQuotationNo($pdo, $savedQuotationNo);
        }

        /* Direction 2: quotation page has saved enquiry number. */
        if ($savedEnquiryNo !== "") {
            $byEnquiry = getQuotationDetailsByEnquiryNo($pdo, $savedEnquiryNo);

            if (($details["entered_by"] ?? "") === "") {
                $details["entered_by"] = $byEnquiry["entered_by"] ?? "";
            }
            if (($details["enquiry_no"] ?? "") === "") {
                $details["enquiry_no"] = $savedEnquiryNo;
            }
            foreach (($byEnquiry["quotation_nos"] ?? []) as $q) {
                if ($q !== "" && !in_array($q, $details["quotation_nos"], true)) {
                    $details["quotation_nos"][] = $q;
                }
            }
            if (($details["quotation_no"] ?? "") === "" && !empty($byEnquiry["quotation_no"])) {
                $details["quotation_no"] = $byEnquiry["quotation_no"];
            }
        }

        $row["linked_quotation_no"] = $details["quotation_no"] ?? "";
        $row["linked_quotation_nos"] = $details["quotation_nos"] ?? [];
        $row["entered_by"] = $details["entered_by"] ?? "";

        /* If salesdata has a quotation for this enquiry and the enquiry record
           itself has no quotation number, expose it to the existing UI. */
        if ($savedQuotationNo === "" && !empty($details["quotation_no"])) {
            $row["sales_order_no"] = $details["quotation_no"];
        }
    }
    unset($row);
}












/* =========================================================



   METHOD



========================================================= */







$method =



    $_SERVER["REQUEST_METHOD"];











/* =========================================================



   GET



========================================================= */







if (



    $method === "GET"



) {







    try {







        $sql = "



            SELECT



                id,



                enquiry_no,



                enquiry_date,



                customer_name,



                address,



                phone_number,



                enquiry_source,



                description,



                attachments,



                added_by,



                assigned_to,



                brought_by,



                sales_order_no,



                created_at,



                updated_at



            FROM enquiry_report



            ORDER BY id DESC



        ";











        $stmt =



            $pdo->prepare(



                $sql



            );











        $stmt->execute();











        $data =



            $stmt->fetchAll();







        attachQuotationEnteredBy(



            $pdo,



            $data



        );











        foreach (



            $data as &$row



        ) {







            $row["attachments"] =



                parseAttachments(



                    $row["attachments"]



                );







        }











        unset($row);











        $nextEnquiryNo =



            getNextEnquiryNumber(



                $pdo



            );











        responseJson(



            true,



            "Enquiries loaded successfully.",



            $data,



            [



                "next_enquiry_no" =>



                    $nextEnquiryNo



            ]



        );











    } catch (



        Throwable $e



    ) {







        http_response_code(



            500



        );











        responseJson(



            false,



            "Failed to load enquiries.",



            null,



            [



                "error" =>



                    $e->getMessage()



            ]



        );







    }







}











/* =========================================================



   POST



   ADD OR UPDATE



========================================================= */







if (



    $method === "POST"



) {







    try {







        $id =



            isset($_POST["id"])



                ? (int)$_POST["id"]



                : 0;











        $isEdit =



            $id > 0;











        /* ===============================================



           FORM VALUES



        =============================================== */







        $enquiryDate =



            trim(



                $_POST["enquiry_date"] ??



                ""



            );











        $customerName =



            trim(



                $_POST["customer_name"] ??



                ""



            );











        $address =



            trim(



                $_POST["address"] ??



                ""



            );











        $phoneNumber =



            trim(



                $_POST["phone_number"] ??



                ""



            );











        $enquirySource =



            trim(



                $_POST["enquiry_source"] ??



                ""



            );











        $description =



            trim(



                $_POST["description"] ??



                ""



            );











        $addedBy =



            trim(



                $_POST["added_by"] ??



                ""



            );











        /* ===============================================



           NEW FIELDS



        =============================================== */







        $assignedTo =



            trim(



                $_POST["assigned_to"] ??



                ""



            );











        $broughtBy =



            trim(



                $_POST["brought_by"] ??



                ""



            );











        $salesOrderNo =



            trim(



                $_POST["sales_order_no"] ??



                ""



            );











        /* ===============================================



           TALLY QUOTATION LOOKUP



           If a quotation is entered manually, use Tally's



           enquiry_no as the enquiry number and return the



           corresponding EnteredBy through the normal response.



        =============================================== */







        $quotationDetails =



            getEnquiryDetailsByQuotationNo(



                $pdo,



                $salesOrderNo



            );







        $tallyEnquiryNo =



            trim(



                (string)(



                    $quotationDetails["enquiry_no"] ??



                    ""



                )



            );











        /* ===============================================



           VALIDATION



        =============================================== */







        if (



            $enquiryDate === ""



        ) {







            http_response_code(



                400



            );







            responseJson(



                false,



                "Enquiry date is required."



            );







        }











        if (



            $customerName === ""



        ) {







            http_response_code(



                400



            );







            responseJson(



                false,



                "Customer name is required."



            );







        }











        if (



            $addedBy === ""



        ) {







            http_response_code(



                400



            );







            responseJson(



                false,



                "Added by user is required."



            );







        }











        $allowedSources = [



            "WhatsApp",



            "Phone",



            "Email",



            "SMA",



            "Walk In"



        ];







        if (



            $enquirySource === "" ||



            !in_array(



                $enquirySource,



                $allowedSources,



                true



            )



        ) {







            http_response_code(



                400



            );







            responseJson(



                false,



                "Valid enquiry source is required."



            );







        }











        /* ===============================================



           UPDATE



        =============================================== */







        if ($isEdit) {







            $stmt =



                $pdo->prepare("



                    SELECT



                        id,



                        enquiry_no,



                        attachments



                    FROM enquiry_report



                    WHERE id = :id



                    LIMIT 1



                ");











            $stmt->execute([



                ":id" => $id



            ]);











            $existing =



                $stmt->fetch();











            if (!$existing) {







                http_response_code(



                    404



                );







                responseJson(



                    false,



                    "Enquiry not found."



                );







            }











            $enquiryNo =



                $existing["enquiry_no"];







            /*



             * If the user entered a quotation number and Tally already



             * has an enquiry number against that quotation, keep the



             * Tally enquiry number in enquiry_report.



             */



            if ($tallyEnquiryNo !== "") {



                $enquiryNo = $tallyEnquiryNo;



            }











            $oldAttachments =



                parseAttachments(



                    $existing["attachments"]



                );











            $keepAttachments = [];











            if (



                isset(



                    $_POST["keep_attachments"]



                )



            ) {







                $keepAttachments =



                    json_decode(



                        $_POST["keep_attachments"],



                        true



                    );











                if (



                    !is_array(



                        $keepAttachments



                    )



                ) {







                    $keepAttachments = [];







                }







            } else {







                $keepAttachments =



                    $oldAttachments;







            }











            foreach (



                $oldAttachments



                as $oldFile



            ) {







                $oldId =



                    $oldFile["id"] ??



                    "";











                $stillExists =



                    false;











                foreach (



                    $keepAttachments



                    as $keepFile



                ) {







                    if (



                        isset(



                            $keepFile["id"]



                        ) &&



                        $keepFile["id"] ===



                        $oldId



                    ) {







                        $stillExists =



                            true;







                        break;







                    }







                }











                if (



                    !$stillExists



                ) {







                    deleteAttachmentFile(



                        $oldFile



                    );







                }







            }











            $newAttachments =



                uploadAttachments(



                    $enquiryNo



                );











            $allAttachments =



                array_merge(



                    $keepAttachments,



                    $newAttachments



                );











            /* =============================================



               UPDATE ENQUIRY



            ============================================= */







            $sql = "



                UPDATE enquiry_report



                SET



                    enquiry_no =



                        :enquiry_no,







                    enquiry_date =



                        :enquiry_date,







                    customer_name =



                        :customer_name,







                    address =



                        :address,







                    phone_number =



                        :phone_number,







                    enquiry_source =



                        :enquiry_source,







                    description =



                        :description,







                    attachments =



                        :attachments,







                    added_by =



                        :added_by,







                    assigned_to =



                        :assigned_to,







                    brought_by =



                        :brought_by,







                    sales_order_no =



                        :sales_order_no,







                    updated_at =



                        NOW()







                WHERE id =



                    :id



            ";











            $stmt =



                $pdo->prepare(



                    $sql



                );











            $stmt->execute([







                ":enquiry_no" =>



                    $enquiryNo,







                ":enquiry_date" =>



                    $enquiryDate,







                ":customer_name" =>



                    $customerName,







                ":address" =>



                    $address,







                ":phone_number" =>



                    $phoneNumber,







                ":enquiry_source" =>



                    $enquirySource,







                ":description" =>



                    $description,







                ":attachments" =>



                    json_encode(



                        $allAttachments,



                        JSON_UNESCAPED_UNICODE |



                        JSON_UNESCAPED_SLASHES



                    ),







                ":added_by" =>



                    $addedBy,







                ":assigned_to" =>



                    $assignedTo,







                ":brought_by" =>



                    $broughtBy,







                ":sales_order_no" =>



                    $salesOrderNo,







                ":id" =>



                    $id







            ]);











            /* =============================================



               GET UPDATED RECORD



            ============================================= */







            $stmt =



                $pdo->prepare("



                    SELECT



                        id,



                        enquiry_no,



                        enquiry_date,



                        customer_name,



                        address,



                        phone_number,



                        enquiry_source,



                        description,



                        attachments,



                        added_by,



                        assigned_to,



                        brought_by,



                        sales_order_no,



                        created_at,



                        updated_at



                    FROM enquiry_report



                    WHERE id = :id



                    LIMIT 1



                ");











            $stmt->execute([



                ":id" =>



                    $id



            ]);











            $updated =



                $stmt->fetch();







            $updatedData = [



                $updated



            ];







            attachQuotationEnteredBy(



                $pdo,



                $updatedData



            );







            $updated =



                $updatedData[0];











            $updated["attachments"] =



                parseAttachments(



                    $updated["attachments"]



                );











            responseJson(



                true,



                "Enquiry updated successfully.",



                $updated,



                [



                    "next_enquiry_no" =>



                        getNextEnquiryNumber(



                            $pdo



                        )



                ]



            );







        }











        /* ===============================================



           ADD NEW



        =============================================== */







        $pdo->beginTransaction();











        try {







            $enquiryNo =



                getNextEnquiryNumber(



                    $pdo



                );







            /*



             * When a quotation is entered manually, Tally is the source



             * of truth for the enquiry number linked to that quotation.



             */



            if ($tallyEnquiryNo !== "") {



                $enquiryNo = $tallyEnquiryNo;



            }











            $newAttachments =



                uploadAttachments(



                    $enquiryNo



                );











            /* =============================================



               INSERT ENQUIRY



            ============================================= */







            $sql = "



                INSERT INTO enquiry_report



                (



                    enquiry_no,



                    enquiry_date,



                    customer_name,



                    address,



                    phone_number,



                    enquiry_source,



                    description,



                    attachments,



                    added_by,



                    assigned_to,



                    brought_by,



                    sales_order_no,



                    created_at,



                    updated_at



                )



                VALUES



                (



                    :enquiry_no,



                    :enquiry_date,



                    :customer_name,



                    :address,



                    :phone_number,



                    :enquiry_source,



                    :description,



                    :attachments,



                    :added_by,



                    :assigned_to,



                    :brought_by,



                    :sales_order_no,



                    NOW(),



                    NOW()



                )



            ";











            $stmt =



                $pdo->prepare(



                    $sql



                );











            $stmt->execute([







                ":enquiry_no" =>



                    $enquiryNo,







                ":enquiry_date" =>



                    $enquiryDate,







                ":customer_name" =>



                    $customerName,







                ":address" =>



                    $address,







                ":phone_number" =>



                    $phoneNumber,







                ":enquiry_source" =>



                    $enquirySource,







                ":description" =>



                    $description,







                ":attachments" =>



                    json_encode(



                        $newAttachments,



                        JSON_UNESCAPED_UNICODE |



                        JSON_UNESCAPED_SLASHES



                    ),







                ":added_by" =>



                    $addedBy,







                ":assigned_to" =>



                    $assignedTo,







                ":brought_by" =>



                    $broughtBy,







                ":sales_order_no" =>



                    $salesOrderNo







            ]);











            $newId =



                $pdo->lastInsertId();











            $pdo->commit();











        } catch (



            Throwable $e



        ) {







            if (



                $pdo->inTransaction()



            ) {







                $pdo->rollBack();







            }











            throw $e;







        }











        /* ===============================================



           GET INSERTED RECORD



        =============================================== */







        $stmt =



            $pdo->prepare("



                SELECT



                    id,



                    enquiry_no,



                    enquiry_date,



                    customer_name,



                    address,



                    phone_number,



                    enquiry_source,



                    description,



                    attachments,



                    added_by,



                    assigned_to,



                    brought_by,



                    sales_order_no,



                    created_at,



                    updated_at



                FROM enquiry_report



                WHERE id = :id



                LIMIT 1



            ");











        $stmt->execute([



            ":id" =>



                $newId



        ]);











        $newRecord =



            $stmt->fetch();







        $newRecordData = [



            $newRecord



        ];







        attachQuotationEnteredBy(



            $pdo,



            $newRecordData



        );







        $newRecord =



            $newRecordData[0];











        $newRecord["attachments"] =



            parseAttachments(



                $newRecord["attachments"]



            );











        responseJson(



            true,



            "Enquiry added successfully.",



            $newRecord,



            [



                "enquiry_no" =>



                    $enquiryNo,







                "next_enquiry_no" =>



                    getNextEnquiryNumber(



                        $pdo



                    )



            ]



        );











    } catch (



        Throwable $e



    ) {







        http_response_code(



            500



        );











        responseJson(



            false,



            "Failed to save enquiry.",



            null,



            [



                "error" =>



                    $e->getMessage()



            ]



        );







    }







}











/* =========================================================



   METHOD NOT ALLOWED



========================================================= */







http_response_code(



    405



);











responseJson(



    false,



    "Method not allowed."



);