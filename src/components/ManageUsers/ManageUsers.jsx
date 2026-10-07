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
import { resizeImage, MAX_UPLOAD_BYTES } from "../MyProfile/profilePhoto";


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
        phone: "",
        photo: "",

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


    const handlePhotoSelect = async (e) => {

        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please choose an image file");
            return;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            alert("Image must be smaller than 10 MB");
            return;
        }

        try {

            const photo = await resizeImage(file);

            setSelectedUser((prev) => ({ ...prev, photo }));

        } catch (err) {

            console.log(err);

            alert(err.message);

        }

    };


    const updateUser = async () => {

        try {

            await updateDoc(doc(db, "Users", selectedUser.id), {

                firstName: selectedUser.firstName,
                lastName: selectedUser.lastName,
                email: selectedUser.email,
                role: selectedUser.role,
                phone: (selectedUser.phone || "").trim(),
                photo: selectedUser.photo || "",

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

                                    <th>Photo</th>

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
                                            colSpan="8"
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

                                            <td>
                                                {user.photo ? (
                                                    <img
                                                        src={user.photo}
                                                        alt=""
                                                        className="user-thumb"
                                                    />
                                                ) : (
                                                    <span className="user-thumb user-thumb-initial">
                                                        {(user.firstName || "?").charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </td>

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

                                <div className="photo-group">

                                    {selectedUser.photo ? (
                                        <img
                                            src={selectedUser.photo}
                                            alt="Profile"
                                            className="edit-photo"
                                        />
                                    ) : (
                                        <span className="edit-photo user-thumb-initial">
                                            {(selectedUser.firstName || "?").charAt(0).toUpperCase()}
                                        </span>
                                    )}

                                    <div className="photo-actions">

                                        <label className="photo-btn">
                                            {selectedUser.photo ? "Change Photo" : "Add Photo"}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                hidden
                                                onChange={handlePhotoSelect}
                                            />
                                        </label>

                                        {selectedUser.photo && (
                                            <button
                                                type="button"
                                                className="photo-btn photo-remove"
                                                onClick={() =>
                                                    setSelectedUser((prev) => ({ ...prev, photo: "" }))
                                                }
                                            >
                                                Remove
                                            </button>
                                        )}

                                    </div>

                                </div>

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

                                    <label>Phone</label>

                                    <input
                                        type="tel"
                                        name="phone"
                                        value={selectedUser.phone || ""}
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