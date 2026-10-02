import Banner from "../Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./ManageUsers.css";
import {
    collection,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
} from "firebase/firestore";

import { db } from "../../components/firebase";


const ManageUsers = () => {

    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);

    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");

    // Edit Modal
    const [showEdit, setShowEdit] = useState(false);

    const [selectedUser, setSelectedUser] = useState({
        id: "",
        firstName: "",
        lastName: "",
        email: "",
        role: "",

    });



    const loadUsers = async () => {
        try {
            setLoading(true);

            const snapshot = await getDocs(collection(db, "Users"));

            console.log("Documents:", snapshot.docs.length);

            const list = snapshot.docs.map((doc) => {
                console.log(doc.id, doc.data()); // See actual fields
                return {
                    id: doc.id,
                    ...doc.data(),
                };
            });

            setUsers(list);
            setFilteredUsers(list);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {

        loadUsers();

    }, []);



    useEffect(() => {

        const keyword = search.toLowerCase();

        const result = users.filter((item) => {

            const fullName =
                `${item.firstName || ""} ${item.lastName || ""}`.toLowerCase();

            return (
                fullName.includes(keyword) ||
                (item.email || "").toLowerCase().includes(keyword) ||
                (item.role || "").toLowerCase().includes(keyword)
            );

        });

        setFilteredUsers(result);

    }, [search, users]);


    const handleEdit = (user) => {

        setSelectedUser(user);

        setShowEdit(true);

    };


    const handleChange = (e) => {

        const { name, value } = e.target;

        setSelectedUser({
            ...selectedUser,
            [name]: value,
        });

    };


    const updateUser = async () => {

        try {

            await updateDoc(doc(db, "Users", selectedUser.id), {

                firstName: selectedUser.firstName,
                lastName: selectedUser.lastName,
                email: selectedUser.email,
                role: selectedUser.role,


            });

            alert("User Updated Successfully");

            setShowEdit(false);

            loadUsers();

        } catch (err) {

            console.log(err);

            alert("Unable to update user");

        }

    };


    const deleteUser = async () => {

        const confirmDelete = window.confirm(
            "Are you sure you want to delete this user?"
        );

        if (!confirmDelete) return;

        try {

            await deleteDoc(doc(db, "Users", selectedUser.id));

            alert("User Deleted Successfully");

            setShowEdit(false);

            loadUsers();

        } catch (err) {

            console.log(err);

            alert("Unable to delete user");

        }

    };



    return (

        <>

            <Banner />

            <div className="manage-users">

                <div className="manage-header">

                    <div className="header-left">
                        <h2>Manage Users</h2>
                    </div>
                    <div className="header-right">

                    </div>

                    <input
                        type="text"
                        placeholder="Search Username / Email"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                </div>

                {loading ? (

                    <div className="loading">

                        Loading Users...

                    </div>

                ) : (

                    <div className="user-table-container">

                        <table>

                            <thead>

                                <tr>

                                    <th>No</th>

                                    <th>FirstName</th>
                                    <th>LastName</th>

                                    <th>Email</th>



                                    <th>Role</th>



                                    <th>Action</th>

                                </tr>

                            </thead>

                            <tbody>

                                {filteredUsers.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan="7"
                                            style={{
                                                textAlign: "center",
                                                padding: "25px"
                                            }}
                                        >
                                            No Users Found
                                        </td>

                                    </tr>

                                ) : (

                                    filteredUsers.map((user, index) => (

                                        <tr key={user.id}>

                                            <td>{index + 1}</td>

                                            <td>{user.firstName}</td>

                                            <td>{user.lastName}</td>

                                            <td>{user.email}</td>



                                            <td>
                                                <span
                                                    className={user.role === "Admin" ? "role-admin" : ""}
                                                >
                                                    {user.role}
                                                </span>
                                            </td>


                                            <td>

                                                <button
                                                    className="edit-btn"
                                                    onClick={() => handleEdit(user)}
                                                >
                                                    Edit
                                                </button>

                                            </td>

                                        </tr>

                                    ))

                                )}

                            </tbody>

                        </table>

                    </div>

                )}

                {
                    showEdit && (

                        <div className="modal-overlay">

                            <div className="edit-modal">

                                <h2>Edit User</h2>

                                <div className="form-group">

                                    <label>FirstName</label>

                                    <input
                                        type="text"
                                        name="firstName"
                                        value={selectedUser.firstName}
                                        onChange={handleChange}
                                    />

                                </div>
                                <div className="form-group">

                                    <label>LasttName</label>

                                    <input
                                        type="text"
                                        name="lastName"
                                        value={selectedUser.lastName}
                                        onChange={handleChange}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>Email</label>

                                    <input
                                        type="email"
                                        name="email"
                                        value={selectedUser.email}
                                        onChange={handleChange}
                                    />

                                </div>



                                <div className="form-group">

                                    <label>Role</label>

                                    <select
                                        name="role"
                                        value={selectedUser.role}
                                        onChange={handleChange}
                                    >

                                        <option value="admin">Admin</option>
                                        <option value="user">User</option>
                                        <option value="sales">Sales</option>
                                        <option value="KsebUser">KSEB User</option>


                                    </select>

                                </div>



                                <div className="button-group">

                                    <button
                                        className="save-btn"
                                        onClick={updateUser}
                                    >
                                        Save Changes
                                    </button>

                                    <button
                                        className="delete-btn"
                                        onClick={deleteUser}
                                    >
                                        Delete User
                                    </button>

                                    <button
                                        className="cancel-btn"
                                        onClick={() => setShowEdit(false)}
                                    >
                                        Cancel
                                    </button>

                                </div>

                            </div>

                        </div>

                    )
                }

            </div>

        </>

    );

};

export default ManageUsers;